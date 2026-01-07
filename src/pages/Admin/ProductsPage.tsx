import { useEffect, useRef, useState } from "react";
import { supabase } from "@/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Package } from "lucide-react";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  category: string | null;
  material: string | null;
  color: string | null;
  sizes: string[] | null;
  stock_quantity: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

export default function ProductsPage() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const didFetchRef = useRef(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [toggleBusyIds, setToggleBusyIds] = useState<Record<string, boolean>>({});

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState<string>("");
  const [formOriginalPrice, setFormOriginalPrice] = useState<string>("");
  const [formCategory, setFormCategory] = useState("");
  const [formMaterial, setFormMaterial] = useState("");
  const [formColor, setFormColor] = useState("");
  const [formSizes, setFormSizes] = useState("");
  const [formStockQuantity, setFormStockQuantity] = useState<string>("0");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    let alive = true;
    if (didFetchRef.current) return;
    didFetchRef.current = true;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (!alive) return;

        const { data, error } = await supabase.from("products").select("*");

        if (!alive) return;
        if (error) {
          setError(error.message || "Failed to load products");
          setProducts([]);
          return;
        }

        const rows = Array.isArray(data) ? (data as ProductRow[]) : [];
        setProducts(rows);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load products");
        setProducts([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const resetAddForm = () => {
    setFormName("");
    setFormDescription("");
    setFormPrice("");
    setFormOriginalPrice("");
    setFormCategory("");
    setFormMaterial("");
    setFormColor("");
    setFormSizes("");
    setFormStockQuantity("0");
    setFormImageUrl("");
    setFormIsActive(true);
    setAddError(null);
  };

  const openAddModal = () => {
    setModalMode("add");
    setEditingProduct(null);
    resetAddForm();
    setIsAddOpen(true);
  };

  const openEditModal = (product: ProductRow) => {
    setModalMode("edit");
    setEditingProduct(product);
    setAddError(null);
    setFormName(product.name ?? "");
    setFormDescription(product.description ?? "");
    setFormPrice(String(product.price ?? ""));
    setFormOriginalPrice(product.original_price == null ? "" : String(product.original_price));
    setFormCategory(product.category ?? "");
    setFormMaterial(product.material ?? "");
    setFormColor(product.color ?? "");
    setFormSizes(product.sizes?.join(", ") ?? "");
    setFormStockQuantity(String(product.stock_quantity ?? 0));
    setFormImageUrl(product.image_url ?? "");
    setFormIsActive(!!product.is_active);
    setIsAddOpen(true);
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;
    setAddError(null);

    const name = formName.trim();
    const priceNumber = Number(formPrice);

    if (!name) {
      setAddError("Product Name is required");
      return;
    }

    if (!Number.isFinite(priceNumber)) {
      setAddError("Price is required");
      return;
    }

    const stockNumber = formStockQuantity.trim() === "" ? 0 : Number(formStockQuantity);
    const originalPriceNumber = formOriginalPrice.trim() === "" ? null : Number(formOriginalPrice);
    const material = formMaterial.trim() === "" ? null : formMaterial.trim();
    const color = formColor.trim() === "" ? null : formColor.trim();
    const sizes =
      formSizes.trim() === ""
        ? null
        : formSizes
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

    if (!Number.isFinite(stockNumber)) {
      setAddError("Stock Quantity must be a number");
      return;
    }

    if (originalPriceNumber !== null && !Number.isFinite(originalPriceNumber)) {
      setAddError("Original Price must be a number");
      return;
    }

    const nextDescription = formDescription.trim() === "" ? null : formDescription;
    const nextCategory = formCategory.trim() === "" ? null : formCategory;
    const nextImageUrl = formImageUrl.trim() === "" ? null : formImageUrl;
    const nextIsActive = formIsActive;

    type ProductUpdatePayload = {
      name?: string;
      description?: string | null;
      price?: number;
      original_price?: number | null;
      category?: string | null;
      material?: string | null;
      color?: string | null;
      sizes?: string[] | null;
      stock_quantity?: number;
      image_url?: string | null;
      is_active?: boolean;
    };

    const updatePayload: ProductUpdatePayload = {};

    if (name !== (editingProduct.name ?? "")) updatePayload.name = name;
    if (nextDescription !== editingProduct.description) updatePayload.description = nextDescription;
    if (priceNumber !== editingProduct.price) updatePayload.price = priceNumber;
    if (originalPriceNumber !== editingProduct.original_price) updatePayload.original_price = originalPriceNumber;
    if (nextCategory !== editingProduct.category) updatePayload.category = nextCategory;
    if (material !== editingProduct.material) updatePayload.material = material;
    if (color !== editingProduct.color) updatePayload.color = color;
    if ((sizes ?? null)?.join("\u0000") !== (editingProduct.sizes ?? null)?.join("\u0000")) updatePayload.sizes = sizes;
    if (stockNumber !== editingProduct.stock_quantity) updatePayload.stock_quantity = stockNumber;
    if (nextImageUrl !== editingProduct.image_url) updatePayload.image_url = nextImageUrl;
    if (nextIsActive !== editingProduct.is_active) updatePayload.is_active = nextIsActive;

    if (Object.keys(updatePayload).length === 0) {
      setIsAddOpen(false);
      resetAddForm();
      setEditingProduct(null);
      setModalMode("add");
      return;
    }

    setIsUpdating(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setAddError(sessionError.message || "Failed to validate session");
        return;
      }

      if (!sessionData.session?.access_token) {
        setAddError("You must be logged in to update products");
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", editingProduct.id)
        .select("*")
        .single();

      if (error || !data) {
        setAddError(error?.message || "Failed to update product");
        return;
      }

      const updated = data as ProductRow;
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setIsAddOpen(false);
      resetAddForm();
      setEditingProduct(null);
      setModalMode("add");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update product";
      setAddError(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddProduct = async () => {
    setAddError(null);

    const name = formName.trim();
    const priceNumber = Number(formPrice);

    if (!name) {
      setAddError("Product Name is required");
      return;
    }

    if (!Number.isFinite(priceNumber)) {
      setAddError("Price is required");
      return;
    }

    const stockNumber = formStockQuantity.trim() === "" ? 0 : Number(formStockQuantity);
    const originalPriceNumber = formOriginalPrice.trim() === "" ? null : Number(formOriginalPrice);
    const material = formMaterial.trim() === "" ? null : formMaterial.trim();
    const color = formColor.trim() === "" ? null : formColor.trim();
    const sizes =
      formSizes.trim() === ""
        ? null
        : formSizes
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

    if (!Number.isFinite(stockNumber)) {
      setAddError("Stock Quantity must be a number");
      return;
    }

    if (originalPriceNumber !== null && !Number.isFinite(originalPriceNumber)) {
      setAddError("Original Price must be a number");
      return;
    }

    setIsAdding(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setAddError(sessionError.message || "Failed to validate session");
        return;
      }

      if (!sessionData.session?.access_token) {
        setAddError("You must be logged in to add products");
        return;
      }

      type ProductInsertPayload = {
        name: string;
        description: string | null;
        price: number;
        original_price: number | null;
        category: string | null;
        stock_quantity: number;
        image_url: string | null;
        is_active: boolean;
        material?: string;
        color?: string;
        sizes?: string[];
      };

      const insertPayload: ProductInsertPayload = {
        name,
        description: formDescription.trim() === "" ? null : formDescription,
        price: priceNumber,
        original_price: originalPriceNumber,
        category: formCategory.trim() === "" ? null : formCategory,
        stock_quantity: stockNumber,
        image_url: formImageUrl.trim() === "" ? null : formImageUrl,
        is_active: formIsActive,
      };

      if (material !== null) insertPayload.material = material;
      if (color !== null) insertPayload.color = color;
      if (sizes !== null) insertPayload.sizes = sizes;

      const { data, error } = await supabase
        .from("products")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error || !data) {
        setAddError(error?.message || "Failed to add product");
        return;
      }

      const created = data as ProductRow;

      setProducts((prev) => [created, ...prev]);
      setIsAddOpen(false);
      resetAddForm();
    } catch (e: any) {
      setAddError(e?.message || "Failed to add product");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    let previous: ProductRow[] | null = null;
    setDeleteBusyId(id);
    setProducts((prev) => {
      previous = prev;
      return prev.filter((p) => p.id !== id);
    });

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        if (previous) setProducts(previous);
        setError(error.message || "Failed to delete product");
      }
    } catch (e: any) {
      if (previous) setProducts(previous);
      setError(e?.message || "Failed to delete product");
    } finally {
      setDeleteBusyId((v) => (v === id ? null : v));
    }
  };

  const handleToggleVisible = async (id: string, next: boolean) => {
    const prevRow = products.find((p) => p.id === id);
    if (!prevRow) return;

    setToggleBusyIds((m) => ({ ...m, [id]: true }));
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: next } : p)));

    try {
      const { error } = await supabase.from("products").update({ is_active: next }).eq("id", id);
      if (error) {
        setProducts((prev) => prev.map((p) => (p.id === id ? prevRow : p)));
        setError(error.message || "Failed to update product");
      }
    } catch (e: any) {
      setProducts((prev) => prev.map((p) => (p.id === id ? prevRow : p)));
      setError(e?.message || "Failed to update product");
    } finally {
      setToggleBusyIds((m) => ({ ...m, [id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+120px)]">
      {/* Mobile Header with Sticky Add Button */}
      <div className="md:hidden sticky top-0 z-30 w-full bg-background/95 backdrop-blur border-b border-border px-4 py-4 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight">Products</h1>
          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Inventory Management</p>
        </div>
        <Button
          type="button"
          onClick={openAddModal}
          size="sm"
          className="rounded-xl px-5 h-11 font-bold uppercase text-[10px] shadow-sm active:scale-95 transition-transform"
        >
          Add Product
        </Button>
      </div>

      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="bg-card rounded-2xl shadow-lg md:border border-border">
          <div className="p-0 md:p-6">
            <div className="hidden md:flex items-center justify-between pb-6 border-b border-border mb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Products</h1>
                <p className="text-sm text-muted-foreground">Manage your store inventory and availability.</p>
              </div>
              <Button
                type="button"
                onClick={openAddModal}
                className="h-11 px-8 rounded-xl font-bold"
              >
                Add Product
              </Button>
            </div>

            {loading ? (
              <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground animate-pulse">Loading products...</p>
              </div>
            ) : (
              <div className="px-0 md:px-0 py-4 md:py-0">
                {error ? <div className="mx-4 md:mx-0 mb-6 rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-sm text-destructive font-medium">{error}</div> : null}

                {products.length === 0 ? (
                  <div className="mx-4 md:mx-0 min-h-[40vh] flex flex-col items-center justify-center text-center space-y-4 rounded-3xl border border-dashed border-border p-12">
                    <Package className="h-12 w-12 text-muted-foreground opacity-20" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">No products found</p>
                      <p className="text-xs text-muted-foreground">Start adding products to see them here.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:hidden px-4">
                      {products.map((p) => (
                        <div key={p.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-lg leading-tight truncate mb-1">{p.name}</h3>
                              <div className="text-base font-bold text-primary flex items-baseline gap-2">
                                <span>₹{p.price.toLocaleString()}</span>
                                {p.original_price != null ? (
                                  <span className="text-sm text-muted-foreground line-through font-normal">₹{p.original_price.toLocaleString()}</span>
                                ) : null}
                              </div>
                            </div>

                            <div className="shrink-0">
                              <Switch
                                checked={p.is_active}
                                disabled={!!toggleBusyIds[p.id]}
                                onCheckedChange={(next) => handleToggleVisible(p.id, next)}
                                aria-label="Visible"
                                className="scale-110"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-y-3 gap-x-4 py-4 border-y border-border/50">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Category</p>
                              <p className="text-sm font-semibold truncate">{p.category || "General"}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Material</p>
                              <p className="text-sm font-semibold truncate">{p.material || "-"}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">In Stock</p>
                              <p className="text-sm font-semibold">{p.stock_quantity}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-0.5">Product ID</p>
                              <p className="text-[11px] font-mono opacity-60 truncate">{p.id}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            {isAdmin ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="flex-1 h-12 rounded-xl font-bold uppercase text-[11px] tracking-wider active:scale-95 transition-transform"
                                onClick={() => openEditModal(p)}
                                disabled={isAdding || isUpdating}
                              >
                                Edit Product
                              </Button>
                            ) : null}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  className="flex-1 h-12 rounded-xl font-bold uppercase text-[11px] tracking-wider active:scale-95 transition-transform"
                                  disabled={deleteBusyId === p.id}
                                >
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="w-[92%] max-w-sm rounded-3xl p-6">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Product?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This product will be removed from the store.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="flex-col gap-2 mt-6">
                                  <AlertDialogAction
                                    onClick={() => handleDeleteProduct(p.id)}
                                    disabled={deleteBusyId === p.id}
                                    className="w-full h-12 rounded-xl bg-destructive hover:bg-destructive/90 font-bold"
                                  >
                                    Confirm Delete
                                  </AlertDialogAction>
                                  <AlertDialogCancel className="w-full h-12 rounded-xl border-none font-bold">Cancel</AlertDialogCancel>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block">
                      <div className="w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                        <div className="min-w-max">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="p-2 lg:p-4">ID</TableHead>
                                <TableHead className="p-2 lg:p-4">Name</TableHead>
                                <TableHead className="p-2 lg:p-4">Description</TableHead>
                                <TableHead className="p-2 lg:p-4">Price</TableHead>
                                <TableHead className="p-2 lg:p-4">Original Price</TableHead>
                                <TableHead className="p-2 lg:p-4">Category</TableHead>
                                <TableHead className="p-2 lg:p-4">Material</TableHead>
                                <TableHead className="p-2 lg:p-4">Color</TableHead>
                                <TableHead className="p-2 lg:p-4">Sizes</TableHead>
                                <TableHead className="p-2 lg:p-4">Stock</TableHead>
                                <TableHead className="p-2 lg:p-4">Image URL</TableHead>
                                <TableHead className="p-2 lg:p-4">Visible</TableHead>
                                <TableHead className="p-2 lg:p-4">Created At</TableHead>
                                <TableHead className="p-2 lg:p-4 text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="max-w-[220px] truncate p-2 lg:p-4">{p.id}</TableCell>
                                  <TableCell className="max-w-[220px] truncate p-2 lg:p-4">{p.name}</TableCell>
                                  <TableCell className="max-w-[320px] p-2 lg:p-4">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="block truncate cursor-default"
                                          tabIndex={0}
                                          role="button"
                                        >
                                          {p.description ?? ""}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[320px] whitespace-pre-wrap break-words">
                                        {p.description ?? ""}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="p-2 lg:p-4">{p.price}</TableCell>
                                  <TableCell className="p-2 lg:p-4">{p.original_price ?? ""}</TableCell>
                                  <TableCell className="p-2 lg:p-4">{p.category ?? ""}</TableCell>
                                  <TableCell className="p-2 lg:p-4">{p.material ?? ""}</TableCell>
                                  <TableCell className="p-2 lg:p-4">{p.color ?? ""}</TableCell>
                                  <TableCell className="max-w-[240px] p-2 lg:p-4">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="block truncate cursor-default"
                                          tabIndex={0}
                                          role="button"
                                        >
                                          {p.sizes?.join(", ") ?? ""}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[320px] whitespace-pre-wrap break-words">
                                        {p.sizes?.join(", ") ?? ""}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="p-2 lg:p-4">{p.stock_quantity}</TableCell>
                                  <TableCell className="max-w-[260px] p-2 lg:p-4">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="block truncate cursor-default"
                                          tabIndex={0}
                                          role="button"
                                        >
                                          {p.image_url ?? ""}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[320px] whitespace-pre-wrap break-words">
                                        {p.image_url ?? ""}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                  <TableCell className="p-2 lg:p-4">
                                    <Switch
                                      checked={p.is_active}
                                      disabled={!!toggleBusyIds[p.id]}
                                      onCheckedChange={(next) => handleToggleVisible(p.id, next)}
                                      aria-label="Visible"
                                    />
                                  </TableCell>
                                  <TableCell className="max-w-[220px] truncate p-2 lg:p-4">{p.created_at}</TableCell>
                                  <TableCell className="p-2 lg:p-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {isAdmin ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="max-w-full whitespace-nowrap"
                                          onClick={() => openEditModal(p)}
                                          disabled={isAdding || isUpdating}
                                        >
                                          Edit
                                        </Button>
                                      ) : null}

                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            className="max-w-full whitespace-nowrap"
                                            disabled={deleteBusyId === p.id}
                                          >
                                            Delete
                                          </Button>
                                        </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Product</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete this product?
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteProduct(p.id)}
                                            disabled={deleteBusyId === p.id}
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </>
                  )}
                </div>
              )}

            <Dialog
              open={isAddOpen}
              onOpenChange={(open) => {
                setIsAddOpen(open);
                if (!open) {
                  resetAddForm();
                  setEditingProduct(null);
                  setModalMode("add");
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{modalMode === "add" ? "Add Product" : "Update Product"}</DialogTitle>
                  <DialogDescription>
                    {modalMode === "add"
                      ? "Fill in the details below to create a new product."
                      : "Update the details below to modify this product."}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="product-name">Product Name</Label>
                    <Input
                      id="product-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="product-description">Description</Label>
                    <Textarea
                      id="product-description"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="product-price">Price</Label>
                      <Input
                        id="product-price"
                        type="number"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="product-original-price">Original Price</Label>
                      <Input
                        id="product-original-price"
                        type="number"
                        value={formOriginalPrice}
                        onChange={(e) => setFormOriginalPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="product-category">Category</Label>
                      <Input
                        id="product-category"
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="product-stock">Stock Quantity</Label>
                      <Input
                        id="product-stock"
                        type="number"
                        value={formStockQuantity}
                        onChange={(e) => setFormStockQuantity(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="product-material">Material</Label>
                      <Input
                        id="product-material"
                        value={formMaterial}
                        onChange={(e) => setFormMaterial(e.target.value)}
                        placeholder="e.g. Cotton"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="product-color">Color</Label>
                      <Input
                        id="product-color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        placeholder="e.g. Black"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="product-sizes">Sizes</Label>
                    <Input
                      id="product-sizes"
                      value={formSizes}
                      onChange={(e) => setFormSizes(e.target.value)}
                      placeholder="e.g. Free Size, Large, XL"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="product-image-url">Image URL</Label>
                    <Input
                      id="product-image-url"
                      value={formImageUrl}
                      onChange={(e) => setFormImageUrl(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
                    <Label htmlFor="product-active">Active Status</Label>
                    <Switch id="product-active" checked={formIsActive} onCheckedChange={setFormIsActive} />
                  </div>

                  {addError ? <div className="text-sm text-destructive">{addError}</div> : null}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddOpen(false);
                      resetAddForm();
                      setEditingProduct(null);
                      setModalMode("add");
                    }}
                    disabled={isAdding || isUpdating}
                  >
                    Cancel
                  </Button>
                  {modalMode === "add" ? (
                    <Button type="button" onClick={handleAddProduct} disabled={isAdding || isUpdating}>
                      {isAdding ? "Adding..." : "Add"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleUpdateProduct} disabled={isAdding || isUpdating}>
                      {isUpdating ? "Updating..." : "Update"}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
