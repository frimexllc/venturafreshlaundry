import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { 
  Truck, Package, Fuel, Clock, MapPin, CheckCircle2, 
  ArrowUpRight, TrendingUp, TrendingDown, DollarSign, Users 
} from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function LogisticsDashboard({ onClose }) {
  const [stats, setStats] = useState({
    activeOrders: 0,
    completedToday: 0,
    totalDistance: 0,
    fuelCost: 0,
    pendingPickups: 0,
    pendingDeliveries: 0,
    topDriver: null,
    recentTrips: []
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading stats
    const timer = setTimeout(() => {
      setStats({
        activeOrders: 8,
        completedToday: 12,
        totalDistance: 45.2,
        fuelCost: 48.5,
        pendingPickups: 5,
        pendingDeliveries: 3,
        topDriver: { name: 'Alejandro', trips: 8, distance: 32.1 },
        recentTrips: [
          { id: 1, driver: 'Alejandro', vehicle: 'Toyota Sienna', distance: 8.2, cost: 9.8, stops: 3, status: 'completed' },
          { id: 2, driver: 'Carlos', vehicle: 'Ford Transit', distance: 12.5, cost: 14.2, stops: 5, status: 'completed' },
          { id: 3, driver: 'Maria', vehicle: 'Sedán', distance: 5.3, cost: 6.1, stops: 2, status: 'in-progress' },
        ]
      });
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Panel de Logística</h2>
            <p className="text-blue-100 mt-1">Resumen y estadísticas del día</p>
          </div>
          <Button 
            onClick={onClose} 
            variant="secondary" 
            className="bg-white/20 hover:bg-white/30 text-white border-none"
          >
            Cerrar
          </Button>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="px-8 pt-6 w-full justify-start bg-transparent border-b border-gray-100 dark:border-gray-800">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="trips">Viajes</TabsTrigger>
            <TabsTrigger value="vehicles">Vehículos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-8 pt-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Órdenes Activas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {loading ? '...' : stats.activeOrders}
                  </div>
                  <div className="text-green-600 text-xs mt-1 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> +3 vs ayer
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Completadas Hoy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {loading ? '...' : stats.completedToday}
                  </div>
                  <div className="text-emerald-600 text-xs mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +5 vs ayer
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Distancia Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {loading ? '...' : `${stats.totalDistance} mi`}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Coste Combustible
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {loading ? '...' : `$${stats.fuelCost.toFixed(2)}`}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* More Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Actividad Reciente</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8 text-gray-400">Cargando...</div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-4">
                        {stats.recentTrips.map((trip) => (
                          <div key={trip.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                <Truck className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{trip.driver}</p>
                                <p className="text-sm text-gray-500">{trip.vehicle} · {trip.stops} paradas</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900 dark:text-white">{trip.distance} mi</p>
                              <p className="text-sm text-emerald-600">${trip.cost.toFixed(2)}</p>
                            </div>
                            <Badge className={
                              trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                            }>
                              {trip.status === 'completed' ? 'Completado' : 'En Curso'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Conductor</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  {loading ? (
                    <div className="text-center py-8 text-gray-400">Cargando...</div>
                  ) : stats.topDriver ? (
                    <div className="py-4">
                      <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mx-auto flex items-center justify-center text-white text-3xl font-bold mb-4">
                        {stats.topDriver.name.charAt(0)}
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{stats.topDriver.name}</h3>
                      <p className="text-sm text-gray-500 mt-2">
                        {stats.topDriver.trips} viajes hoy
                      </p>
                      <p className="text-lg font-semibold text-blue-600 mt-1">
                        {stats.topDriver.distance} mi totales
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trips" className="p-8 pt-6">
            <div className="text-center py-12 text-gray-400">
              <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Gestión de viajes proximamente</p>
            </div>
          </TabsContent>

          <TabsContent value="vehicles" className="p-8 pt-6">
            <div className="text-center py-12 text-gray-400">
              <Fuel className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Gestión de vehículos proximamente</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}