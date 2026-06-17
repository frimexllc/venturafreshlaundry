// src/components/admin/AdminServicesPage.jsx
import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { toast } from "sonner";
import { Save, Plus, Trash2, X, RefreshCw } from "lucide-react";
import { useLocale } from "../../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const getToken = () => localStorage.getItem("token");
const authHeaders = () => ({
  headers: { Authorization: `Bearer ${getToken()}` }
});

// ============================================================
// EDITOR DE PRECIOS DE LAVADORAS
// ============================================================
const WasherPricesEditor = ({ washers, onUpdate }) => {
  const [items, setItems] = useState(washers);
  const [loading, setLoading] = useState(false);
  
  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };
  
  const addItem = () => {
    setItems([...items, { size: "", size_es: "", price: "$0.00" }]);
  };
  
  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };
  
  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/admin/services-page-config/section`, 
        { section: "washers", data: items }, 
        authHeaders()
      );
      onUpdate(items);
      toast.success("Washer prices updated");
    } catch (error) {
      toast.error("Error updating washer prices");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Washer Prices</h3>
        <Button onClick={addItem} size="sm" disabled={loading}>
          <Plus className="h-4 w-4 mr-1" /> Add Washer
        </Button>
      </div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-end p-3 border rounded-lg bg-white">
            <div className="flex-1">
              <Label className="text-xs">Size (EN)</Label>
              <Input
                value={item.size}
                onChange={(e) => updateItem(idx, "size", e.target.value)}
                placeholder="e.g., 20 lb (2 loads)"
                className="h-9"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Size (ES)</Label>
              <Input
                value={item.size_es || ""}
                onChange={(e) => updateItem(idx, "size_es", e.target.value)}
                placeholder="e.g., 20 lb (2 cargas)"
                className="h-9"
              />
            </div>
            <div className="w-28">
              <Label className="text-xs">Price</Label>
              <Input
                value={item.price}
                onChange={(e) => updateItem(idx, "price", e.target.value)}
                placeholder="$0.00"
                className="h-9"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="mt-5" disabled={loading}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Washer Prices
      </Button>
    </div>
  );
};

// ============================================================
// EDITOR DE PRECIOS DE SECADORAS
// ============================================================
const DryerPricesEditor = ({ dryers, onUpdate }) => {
  const [items, setItems] = useState(dryers);
  const [loading, setLoading] = useState(false);
  
  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };
  
  const addItem = () => {
    setItems([...items, { size: "", time: "10min", price: "$0.00" }]);
  };
  
  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };
  
  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/admin/services-page-config/section`, 
        { section: "dryers", data: items }, 
        authHeaders()
      );
      onUpdate(items);
      toast.success("Dryer prices updated");
    } catch (error) {
      toast.error("Error updating dryer prices");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Dryer Prices</h3>
        <Button onClick={addItem} size="sm" disabled={loading}>
          <Plus className="h-4 w-4 mr-1" /> Add Dryer
        </Button>
      </div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-end p-3 border rounded-lg bg-white">
            <div className="flex-1">
              <Label className="text-xs">Size</Label>
              <Input
                value={item.size}
                onChange={(e) => updateItem(idx, "size", e.target.value)}
                placeholder="e.g., 30 lb"
                className="h-9"
              />
            </div>
            <div className="w-28">
              <Label className="text-xs">Time</Label>
              <Input
                value={item.time}
                onChange={(e) => updateItem(idx, "time", e.target.value)}
                placeholder="10min"
                className="h-9"
              />
            </div>
            <div className="w-28">
              <Label className="text-xs">Price</Label>
              <Input
                value={item.price}
                onChange={(e) => updateItem(idx, "price", e.target.value)}
                placeholder="$0.00"
                className="h-9"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="mt-5" disabled={loading}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Dryer Prices
      </Button>
    </div>
  );
};

// ============================================================
// EDITOR DE PRECIOS POR PIEZA
// ============================================================
const PerPieceEditor = ({ categories, onUpdate }) => {
  const [items, setItems] = useState(categories);
  const [loading, setLoading] = useState(false);
  
  const updateCategoryItem = (catIdx, itemIdx, field, value) => {
    const newItems = [...items];
    newItems[catIdx].items[itemIdx] = { ...newItems[catIdx].items[itemIdx], [field]: value };
    setItems(newItems);
  };
  
  const addCategoryItem = (catIdx) => {
    const newItems = [...items];
    newItems[catIdx].items.push({ name: "", name_es: "", price: "$0.00" });
    setItems(newItems);
  };
  
  const removeCategoryItem = (catIdx, itemIdx) => {
    const newItems = [...items];
    newItems[catIdx].items = newItems[catIdx].items.filter((_, i) => i !== itemIdx);
    setItems(newItems);
  };
  
  const addCategory = () => {
    setItems([...items, { category: "", category_es: "", items: [] }]);
  };
  
  const removeCategory = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };
  
  const updateCategory = (idx, field, value) => {
    const newItems = [...items];
    newItems[idx][field] = value;
    setItems(newItems);
  };
  
  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/admin/services-page-config/section`, 
        { section: "per_piece_categories", data: items }, 
        authHeaders()
      );
      onUpdate(items);
      toast.success("Per-piece prices updated");
    } catch (error) {
      toast.error("Error updating per-piece prices");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Per Piece Pricing</h3>
        <Button onClick={addCategory} size="sm" disabled={loading}>
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      </div>
      
      <div className="max-h-[600px] overflow-y-auto space-y-4">
        {items.map((category, catIdx) => (
          <Card key={catIdx} className="border">
            <CardHeader className="pb-2">
              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <Label className="text-xs">Category (EN)</Label>
                  <Input
                    value={category.category}
                    onChange={(e) => updateCategory(catIdx, "category", e.target.value)}
                    placeholder="e.g., Home Essentials"
                    className="h-9"
                    disabled={loading}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Category (ES)</Label>
                  <Input
                    value={category.category_es || ""}
                    onChange={(e) => updateCategory(catIdx, "category_es", e.target.value)}
                    placeholder="e.g., Artículos del hogar"
                    className="h-9"
                    disabled={loading}
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeCategory(catIdx)} className="mt-5" disabled={loading}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {category.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Name (EN)</Label>
                      <Input
                        value={item.name}
                        onChange={(e) => updateCategoryItem(catIdx, itemIdx, "name", e.target.value)}
                        placeholder="Item name"
                        className="h-8 text-sm"
                        disabled={loading}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Name (ES)</Label>
                      <Input
                        value={item.name_es || ""}
                        onChange={(e) => updateCategoryItem(catIdx, itemIdx, "name_es", e.target.value)}
                        placeholder="Nombre del artículo"
                        className="h-8 text-sm"
                        disabled={loading}
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">Price</Label>
                      <Input
                        value={item.price}
                        onChange={(e) => updateCategoryItem(catIdx, itemIdx, "price", e.target.value)}
                        placeholder="$0.00"
                        className="h-8 text-sm"
                        disabled={loading}
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeCategoryItem(catIdx, itemIdx)} className="mt-4" disabled={loading}>
                      <X className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addCategoryItem(catIdx)} className="w-full mt-2" disabled={loading}>
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save All Per-Piece Prices
      </Button>
    </div>
  );
};

// ============================================================
// EDITOR DE SECCIONES OSCURAS (Airbnb, B2B, Commercial)
// ============================================================
const DarkSectionEditor = ({ sectionType, title, data, onUpdate }) => {
  const [formData, setFormData] = useState(data);
  const [loading, setLoading] = useState(false);
  
  const updateField = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };
  
  const updateFeature = (index, value, isSpanish = false) => {
    const featuresKey = isSpanish ? "features_es" : "features";
    const newFeatures = [...(formData[featuresKey] || [])];
    newFeatures[index] = value;
    updateField(featuresKey, newFeatures);
  };
  
  const addFeature = () => {
    updateField("features", [...(formData.features || []), ""]);
  };
  
  const removeFeature = (index) => {
    const newFeatures = [...(formData.features || [])];
    newFeatures.splice(index, 1);
    updateField("features", newFeatures);
  };
  
  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/admin/services-page-config/section`, 
        { section: `${sectionType}_section`, data: formData }, 
        authHeaders()
      );
      onUpdate(formData);
      toast.success(`${title} updated`);
    } catch (error) {
      toast.error(`Error updating ${title}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Heading (EN)</Label>
          <Input
            value={formData.heading || ""}
            onChange={(e) => updateField("heading", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div>
          <Label>Heading (ES)</Label>
          <Input
            value={formData.heading_es || ""}
            onChange={(e) => updateField("heading_es", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Subheading (EN)</Label>
          <Input
            value={formData.subheading || ""}
            onChange={(e) => updateField("subheading", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Subheading (ES)</Label>
          <Input
            value={formData.subheading_es || ""}
            onChange={(e) => updateField("subheading_es", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div>
          <Label>CTA Label (EN)</Label>
          <Input
            value={formData.cta_label || ""}
            onChange={(e) => updateField("cta_label", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div>
          <Label>CTA Label (ES)</Label>
          <Input
            value={formData.cta_label_es || ""}
            onChange={(e) => updateField("cta_label_es", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div>
          <Label>CTA URL</Label>
          <Input
            value={formData.cta_url || ""}
            onChange={(e) => updateField("cta_url", e.target.value)}
            className="mt-1"
            placeholder="/schedule-pickup"
            disabled={loading}
          />
        </div>
        <div>
          <Label>Background Image URL</Label>
          <Input
            value={formData.bg_image_url || ""}
            onChange={(e) => updateField("bg_image_url", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
        <div>
          <Label>Tint Color</Label>
          <Input
            value={formData.tint || "rgba(3, 15, 40, 0.68)"}
            onChange={(e) => updateField("tint", e.target.value)}
            className="mt-1"
            disabled={loading}
          />
        </div>
      </div>
      
      <div>
        <Label className="font-semibold">Features (EN)</Label>
        <div className="space-y-2 mt-2">
          {(formData.features || []).map((feature, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                value={feature}
                onChange={(e) => updateFeature(idx, e.target.value, false)}
                className="flex-1"
                placeholder={`Feature ${idx + 1}`}
                disabled={loading}
              />
              <Button variant="ghost" size="sm" onClick={() => removeFeature(idx)} disabled={loading}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addFeature} className="w-full" disabled={loading}>
            <Plus className="h-3 w-3 mr-1" /> Add Feature
          </Button>
        </div>
      </div>
      
      <div>
        <Label className="font-semibold">Features (ES)</Label>
        <div className="space-y-2 mt-2">
          {(formData.features_es || []).map((feature, idx) => (
            <Input
              key={idx}
              value={feature}
              onChange={(e) => updateFeature(idx, e.target.value, true)}
              placeholder={`Característica ${idx + 1}`}
              disabled={loading}
            />
          ))}
        </div>
      </div>
      
      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save {title}
      </Button>
    </div>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function AdminServicesPage() {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState("washers");
  const [loading, setLoading] = useState(true);
  
  // Estados para cada sección
  const [washers, setWashers] = useState([]);
  const [dryers, setDryers] = useState([]);
  const [perPieceCategories, setPerPieceCategories] = useState([]);
  const [airbnbSection, setAirbnbSection] = useState(null);
  const [b2bSection, setB2bSection] = useState(null);
  const [commercialSection, setCommercialSection] = useState(null);
  
  // Cargar todas las configuraciones
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/public/services-page-config`);
        const config = res.data;
        
        setWashers(config.washers || []);
        setDryers(config.dryers || []);
        setPerPieceCategories(config.per_piece_categories || []);
        setAirbnbSection(config.airbnb_section || null);
        setB2bSection(config.b2b_section || null);
        setCommercialSection(config.commercial_section || null);
        
      } catch (error) {
        console.error("Error loading config:", error);
        toast.error("Error loading configuration");
      } finally {
        setLoading(false);
      }
    };
    
    loadConfig();
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Services Page Configuration</h1>
        <p className="text-slate-600">
          Manage all pricing and content displayed on the public services page
        </p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="washers">Washers</TabsTrigger>
          <TabsTrigger value="dryers">Dryers</TabsTrigger>
          <TabsTrigger value="per-piece">Per Piece</TabsTrigger>
          <TabsTrigger value="airbnb">Airbnb</TabsTrigger>
          <TabsTrigger value="b2b">B2B</TabsTrigger>
          <TabsTrigger value="commercial">Commercial</TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="washers">
            <Card>
              <CardContent className="pt-6">
                <WasherPricesEditor washers={washers} onUpdate={setWashers} />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="dryers">
            <Card>
              <CardContent className="pt-6">
                <DryerPricesEditor dryers={dryers} onUpdate={setDryers} />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="per-piece">
            <Card>
              <CardContent className="pt-6">
                <PerPieceEditor categories={perPieceCategories} onUpdate={setPerPieceCategories} />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="airbnb">
            <Card>
              <CardHeader>
                <CardTitle>Airbnb Section Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {airbnbSection && (
                  <DarkSectionEditor
                    sectionType="airbnb"
                    title="Airbnb Section"
                    data={airbnbSection}
                    onUpdate={setAirbnbSection}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="b2b">
            <Card>
              <CardHeader>
                <CardTitle>B2B Section Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {b2bSection && (
                  <DarkSectionEditor
                    sectionType="b2b"
                    title="B2B Section"
                    data={b2bSection}
                    onUpdate={setB2bSection}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="commercial">
            <Card>
              <CardHeader>
                <CardTitle>Commercial Section Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {commercialSection && (
                  <DarkSectionEditor
                    sectionType="commercial"
                    title="Commercial Section"
                    data={commercialSection}
                    onUpdate={setCommercialSection}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}