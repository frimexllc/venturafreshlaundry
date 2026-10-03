"""
Multi-vehicle route optimization (VRP) for LogisticaPro — phase 2.

Given a depot and a list of stops, splits the stops across several
vehicles and orders each vehicle's stops so the combined distance
driven is minimized. Uses Google OR-Tools' routing solver, the same
engine real fleet-routing products are built on — not a hand-rolled
heuristic.

Distance is straight-line (haversine), not real driving distance: it's
fast enough to solve instantly for the problem sizes this business
actually has (dozens of stops), with no per-call cost to an external
routing API. Swapping in a real driving-distance matrix later (e.g.
from OpenRouteService, already used elsewhere in this codebase) is a
drop-in replacement for `_build_distance_matrix` if the approximation
ever proves too coarse in practice.
"""
import math
from typing import List, Optional, TypedDict

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

EARTH_RADIUS_METERS = 6_371_000
SOLVER_TIME_LIMIT_SECONDS = 5


class Stop(TypedDict):
    id: str
    lat: float
    lng: float


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(a))


def _build_distance_matrix(points: List[Stop]) -> List[List[int]]:
    """OR-Tools wants integer costs — meters, rounded, works fine."""
    n = len(points)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = round(
                    _haversine_meters(points[i]["lat"], points[i]["lng"], points[j]["lat"], points[j]["lng"])
                )
    return matrix


class VehicleRoute(TypedDict):
    vehicle: int
    stop_ids: List[str]
    distance_meters: int


def solve_vrp(
    depot: Stop,
    stops: List[Stop],
    num_vehicles: int,
) -> dict:
    """
    Returns {"routes": [VehicleRoute, ...], "unassigned": [stop_id, ...]}.

    `unassigned` is only ever non-empty if the solver can't find any
    feasible solution at all in the time limit (e.g. more vehicles than
    OR-Tools can reconcile for a degenerate input) — for a plain
    multi-depot-free VRP like this one, every stop is normally assigned.
    """
    if not stops:
        return {"routes": [], "unassigned": []}
    if num_vehicles < 1:
        raise ValueError("num_vehicles must be at least 1")

    points: List[Stop] = [depot] + stops
    depot_index = 0
    distance_matrix = _build_distance_matrix(points)

    manager = pywrapcp.RoutingIndexManager(len(points), num_vehicles, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index: int, to_index: int) -> int:
        return distance_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Lets the solver leave a vehicle with zero stops (e.g. 3 vehicles,
    # 2 stops) instead of failing to find a solution at all.
    routing.AddDimension(transit_callback_index, 0, 3_000_000, True, "Distance")

    # Without this, OR-Tools' default objective (minimize the SUM of all
    # vehicles' distances) can legitimately decide to pile every stop onto
    # one vehicle and leave the rest empty — that does minimize total km
    # driven, but a dispatcher splitting work across drivers wants the
    # ROUTES balanced, not one driver doing everything. Penalizing the
    # span between the shortest and longest route pushes the solver toward
    # an even split instead.
    distance_dimension = routing.GetDimensionOrDie("Distance")
    distance_dimension.SetGlobalSpanCostCoefficient(100)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.FromSeconds(SOLVER_TIME_LIMIT_SECONDS)

    solution = routing.SolveWithParameters(search_parameters)

    if solution is None:
        return {"routes": [], "unassigned": [s["id"] for s in stops]}

    routes: List[VehicleRoute] = []
    assigned_ids = set()
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        stop_ids: List[str] = []
        route_distance = 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != depot_index:
                stop_ids.append(points[node]["id"])
                assigned_ids.add(points[node]["id"])
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)
        routes.append({"vehicle": vehicle_id, "stop_ids": stop_ids, "distance_meters": route_distance})

    unassigned = [s["id"] for s in stops if s["id"] not in assigned_ids]
    return {"routes": routes, "unassigned": unassigned}
