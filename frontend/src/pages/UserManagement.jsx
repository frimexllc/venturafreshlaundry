import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { 
  Users, 
  Shield, 
  Plus, 
  Trash2, 
  Edit2,
  UserPlus,
  X,
  Check,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { t } = useLocale();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "operator"
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API}/admin/users`);
      setUsers(res.data);
    } catch (error) {
      toast.error(t("Error loading users", "Error cargando usuarios"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error(t("Please fill all required fields", "Por favor completa todos los campos obligatorios"));
      return;
    }
    
    setCreating(true);
    try {
      await axios.post(`${API}/admin/users`, newUser);
      toast.success(t("User created successfully", "Usuario creado exitosamente"));
      setShowCreateModal(false);
      setNewUser({ name: "", email: "", password: "", role: "operator" });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error creating user", "Error creando usuario"));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await axios.put(`${API}/admin/users/${userId}/role`, { role: newRole });
      toast.success(t("Role updated successfully", "Rol actualizado exitosamente"));
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating role", "Error actualizando rol"));
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success(t("User deleted successfully", "Usuario eliminado exitosamente"));
      setDeleteConfirm(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error deleting user", "Error eliminando usuario"));
    }
  };

  const getRoleBadge = (role) => {
    return role === "admin" 
      ? "bg-purple-100 text-purple-700 border-purple-200" 
      : "bg-sky-100 text-sky-700 border-sky-200";
  };

  const getRoleLabel = (role) => {
    return role === "admin" 
      ? t("Administrator", "Administrador") 
      : t("Operator", "Operador");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-7 w-7 text-sky-600" />
            {t("User Management", "Gestión de Usuarios")}
          </h1>
          <p className="text-slate-600">
            {t("Manage system users and their permissions", "Gestiona usuarios del sistema y sus permisos")}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-sky-600 hover:bg-sky-700">
          <UserPlus className="h-4 w-4 mr-2" />
          {t("Add User", "Agregar Usuario")}
        </Button>
      </div>

      {/* Role Legend */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-slate-600" />
          {t("Role Permissions", "Permisos de Rol")}
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
            <h4 className="font-medium text-purple-800 mb-2">{t("Administrator", "Administrador")}</h4>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>• {t("Full access to all system features", "Acceso completo a todas las funciones del sistema")}</li>
              <li>• {t("Manage users and permissions", "Gestionar usuarios y permisos")}</li>
              <li>• {t("Access financial reports and settings", "Acceder a reportes financieros y configuración")}</li>
              <li>• {t("Configure services and memberships", "Configurar servicios y membresías")}</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
            <h4 className="font-medium text-sky-800 mb-2">{t("Operator", "Operador")}</h4>
            <ul className="text-sm text-sky-700 space-y-1">
              <li>• {t("View and update order status", "Ver y actualizar estado de órdenes")}</li>
              <li>• {t("Access operator dashboard", "Acceder al panel del operador")}</li>
              <li>• {t("View customer information (limited)", "Ver información de clientes (limitada)")}</li>
              <li>• {t("No access to financial data or settings", "Sin acceso a datos financieros ni configuración")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-900">
            {t("System Users", "Usuarios del sistema")} ({users.length})
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {users.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Users className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>{t("No users found", "No se encontraron usuarios")}</p>
            </div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <span className="text-slate-700 font-semibold">
                        {user.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{user.name}</span>
                        {user.id === currentUser?.id && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            {t("You", "Tú")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {editingUser === user.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                          defaultValue={user.role}
                          onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                        >
                          <option value="admin">{t("Administrator", "Administrador")}</option>
                          <option value="operator">{t("Operator", "Operador")}</option>
                        </select>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setEditingUser(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getRoleBadge(user.role)}`}>
                          <Shield className="h-3 w-3 inline mr-1" />
                          {getRoleLabel(user.role)}
                        </span>
                        
                        {user.id !== currentUser?.id && (
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setEditingUser(user.id)}
                            >
                              <Edit2 className="h-4 w-4 text-slate-500" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setDeleteConfirm(user.id)}
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {/* Delete Confirmation */}
                {deleteConfirm === user.id && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">{t("Confirm Deletion", "Confirmar Eliminación")}</span>
                    </div>
                    <p className="text-sm text-red-600 mb-3">
                      {t(
                        "Are you sure you want to delete {name}? This action cannot be undone.",
                        "¿Estás seguro de que quieres eliminar a {name}? Esta acción no se puede deshacer."
                      ).replace("{name}", user.name)}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        {t("Delete", "Eliminar")}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        {t("Cancel", "Cancelar")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{t("Create New User", "Crear Nuevo Usuario")}</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <Label htmlFor="name">{t("Name *", "Nombre *")}</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder={t("John Doe", "Juan Pérez")}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="email">{t("Email *", "Correo *")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder={t("john@example.com", "juan@ejemplo.com")}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="password">{t("Password *", "Contraseña *")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="role">{t("Role *", "Rol *")}</Label>
                <select
                  id="role"
                  className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="operator">{t("Operator", "Operador")}</option>
                  <option value="admin">{t("Administrator", "Administrador")}</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {newUser.role === "admin" 
                    ? t("Full access to all system features", "Acceso completo a todas las funciones del sistema")
                    : t("Limited access - order management only", "Acceso limitado - solo gestión de órdenes")}
                </p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  type="submit" 
                  className="flex-1 bg-sky-600 hover:bg-sky-700"
                  disabled={creating}
                >
                  {creating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      {t("Create User", "Crear Usuario")}
                    </>
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  {t("Cancel", "Cancelar")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}