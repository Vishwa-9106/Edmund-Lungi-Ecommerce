import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Star, Minus, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/data/products";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/supabase";
import { WishlistHeart } from "@/components/WishlistHeart";
import { AiTryOnModal } from "@/components/AiTryOnModal";

export default function ProductDetailsPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isTryOnModalOpen, setIsTryOnModalOpen] = useState(false);
  const { addToCart } = useCart();
  const { toast } = useToast();

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setProduct(null);

    (async () => {
      try {
        if (!id) {
          if (!alive) return;
          setProduct(null);
          return;
        }

        const { data, error } = await supabase
          .from("products")
          .select(
            "id,name,price,original_price,image_url,category,material,sizes,stock_quantity,is_active,description,color"
          )
          .eq("id", id)
          .eq("is_active", true)
          .single();

        if (!alive) return;
        if (error || !data) {
          setProduct(null);
          return;
        }

        const imageUrl = typeof (data as any).image_url === "string" && (data as any).image_url.length > 0
          ? (data as any).image_url
          : "/placeholder.svg";
        const sizes = Array.isArray((data as any).sizes) ? ((data as any).sizes as string[]) : [];

        setProduct({
          id: String((data as any).id),
          name: String((data as any).name ?? ""),
          price: Number((data as any).price ?? 0),
          originalPrice: (data as any).original_price == null ? undefined : Number((data as any).original_price),
          description: String((data as any).description ?? ""),
          category: String((data as any).category ?? ""),
          color: String((data as any).color ?? ""),
          material: String((data as any).material ?? ""),
          sizes,
          rating: 0,
          reviews: 0,
          images: [imageUrl],
        });
      } catch {
        if (!alive) return;
        setProduct(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Product not found</h1>
          <Link to="/shop">
            <Button>Back to Shop</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast({
        title: "Please select a size",
        variant: "destructive",
      });
      return;
    }

    addToCart(product, selectedSize, quantity);
    toast({
      title: "Added to cart!",
      description: `${product.name} has been added to your cart.`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Shop
        </Link>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="space-y-4">
            <div className="aspect-square rounded-2xl bg-secondary overflow-hidden relative">
              <img
                src={product.images[0]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 z-10">
                <WishlistHeart productId={product.id} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg bg-secondary overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                >
                  <img
                    src={product.images[0]}
                    alt={`${product.name} view ${i}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-sm text-primary font-medium uppercase tracking-wide">
                {product.category}
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-bold mt-2">
                {product.name}
              </h1>

              <div className="flex items-center gap-3 mt-4">
                <div className="flex items-center gap-1">
                  <Star className="w-5 h-5 fill-amber text-amber" />
                  <span className="font-semibold">{product.rating}</span>
                </div>
                <span className="text-muted-foreground">
                  ({product.reviews} reviews)
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">
                &#8377;{product.price.toLocaleString()}
              </span>
              {product.originalPrice && (
                <span className="text-xl text-muted-foreground line-through">
                  &#8377;{product.originalPrice.toLocaleString()}
                </span>
              )}
            </div>

            <p className="text-muted-foreground leading-relaxed">
              {product.description}
            </p>

            <div className="space-y-4 pt-4 border-t border-border">
              <div>
                <p className="font-medium mb-3">Material</p>
                <span className="inline-block px-4 py-2 bg-secondary rounded-lg text-sm">
                  {product.material}
                </span>
              </div>

              <div>
                <p className="font-medium mb-3">Color</p>
                <span className="inline-block px-4 py-2 bg-secondary rounded-lg text-sm">
                  {product.color}
                </span>
              </div>

              <div>
                <p className="font-medium mb-3">Size</p>
                <div className="flex flex-wrap gap-3">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedSize === size
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-medium mb-3">Quantity</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-lg font-semibold w-8 text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="product-action-buttons pt-6">
              <Button
                size="lg"
                className="product-action-button btn-primary w-full gap-2"
                onClick={handleAddToCart}
              >
                <ShoppingBag className="w-5 h-5" />
                Add to Cart
              </Button>
              <button
                type="button"
                className="product-action-button mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:from-purple-700 hover:to-pink-700 hover:shadow-xl"
                onClick={() => setIsTryOnModalOpen(true)}
              >
                <Sparkles className="w-5 h-5" />
                Try with AI
              </button>
            </div>
          </div>
        </div>
        <AiTryOnModal
          isOpen={isTryOnModalOpen}
          onClose={() => setIsTryOnModalOpen(false)}
          productId={product.id}
          productImage={product.images[0]}
          productName={product.name}
        />
      </div>
    </div>
  );
}
