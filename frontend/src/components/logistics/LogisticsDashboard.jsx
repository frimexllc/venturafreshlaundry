import { useState, useEffect } from 'react';
import {
  Button
} from '../ui/button';
import {
  Package, Truck, Fuel, DollarSign, CheckCircle2,
  TrendingUp, ArrowUpRight, X
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
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
    recentTrips: [
      { id: 1, driver: 'Alejandro G.', vehicle: 'Toyota Sienna', distance: '8.2 mi', cost: 9.8, stops: 3, status: 'completed' },
      { id: 2, driver: 'Carlos M.', vehicle: 'Ford Transit', distance: '12.5 mi', cost: 14.2, stops: 5, status: 'in-progress' },
      { id: 3, driver: 'Maria R.', vehicle: 'Honda Civic', distance: '5.3 mi', cost: 6.1, stops: 2, status: 'pending' },
    ]
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }
        const response = await fetch(`${API_URL}/api/dashboard/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          setStats(prev => ({
            ...prev,
            activeOrders: data.pending_orders || 5,
            completedToday: data.orders_today || 8,
            totalDistance: data.total_miles || 42.8,
            pendingPickups: 3,
            pendingDeliveries: 2,
            topDriver: { name: 'Alejandro G.', trips: 8, distance: '32.1 mi' },
          }));
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl h-[90vh] p-0 overflow-hidden bg-white dark:bg-gray-800 border-0">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600">
          <div>
            <DialogTitle className="text-2xl font-bold text-white">
              Panel de Logística
            </DialogTitle>
            <p className="text-blue-100 mt-1">
              Resumen y estadísticas del día
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="h-full flex-1">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="px-6 pt-4 w-full justify-start bg-transparent border-b border-gray-100 dark:border-gray-700">
              <TabsTrigger value="overview">Resumen</TabsTrigger>
              <TabsTrigger value="trips">Viajes</TabsTrigger>
              <TabsTrigger value="vehicles">Vehículos</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="p-6 pt-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
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

                <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
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

                <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
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

                <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Coste Combustible
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {loading ? '...' : `$${(stats.fuelCost || 45.50).toFixed(2)}`}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* More Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Actividad Reciente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="text-center py-8 text-gray-400">Cargando...</div>
                    ) : (
                      <div className="space-y-3">
                        {stats.recentTrips.map((trip) => (
                          <div key={trip.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                                trip.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                <Truck className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{trip.driver}</p>
                                <p className="text-sm text-gray-500">{trip.vehicle} · {trip.stops} paradas</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900 dark:text-white">{trip.distance}</p>
                              <p className="text-sm text-emerald-600">${trip.cost.toFixed(2)}</p>
                            </div>
                            <Badge className={
                              trip.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                              trip.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                            }>
                              {trip.status === 'completed' ? 'Completado' : 
                               trip.status === 'in-progress' ? 'En Curso' : 'Pendiente'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Top Conductor</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    {loading ? (
                      <div className="text-center py-8 text-gray-400">Cargando...</div>
                    ) : stats.topDriver ? (
                      <div className="py-4">
                        <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mx-auto flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg">
                          {stats.topDriver.name.charAt(0)}
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{stats.topDriver.name}</h3>
                        <p className="text-sm text-gray-500 mt-2">
                          {stats.topDriver.trips} viajes hoy
                        </p>
                        <p className="text-lg font-semibold text-blue-600 mt-1">
                          {stats.topDriver.distance}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="trips" className="p-6 pt-4">
              <div className="text-center py-12 text-gray-400">
                <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Gestión de viajes próximamente</p>
              </div>
            </TabsContent>

            <TabsContent value="vehicles" className="p-6 pt-4">
              <div className="text-center py-12 text-gray-400">
                <Fuel className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Gestión de vehículos próximamente</p>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
