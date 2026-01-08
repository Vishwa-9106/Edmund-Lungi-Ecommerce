import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { MainLayout } from "@/layouts/MainLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense, useEffect } from "react";

// Lazy load pages for better performance
const HomePage = lazy(() => import("@/pages/Home/HomePage"));
const ShopPage = lazy(() => import("@/pages/Shop/ShopPage"));
const ProductDetailsPage = lazy(() => import("@/pages/ProductDetails/ProductDetailsPage"));
const AboutPage = lazy(() => import("@/pages/About/AboutPage"));
const ContactPage = lazy(() => import("@/pages/Contact/ContactPage"));
const CartPage = lazy(() => import("@/pages/Cart/CartPage"));
const FAQPage = lazy(() => import("@/pages/FAQ/FAQPage"));
const LoginPage = lazy(() => import("@/pages/Login/LoginPage"));
const SignupPage = lazy(() => import("@/pages/Signup/SignupPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmail/VerifyEmailPage"));
const CustomerDashboard = lazy(() => import("@/pages/CustomerDashboard/CustomerDashboard"));
const AdminPage = lazy(() => import("@/pages/Admin/AdminPage"));
const AdminDashboardPage = lazy(() => import("@/pages/Admin/DashboardPage"));
const AdminSalesAnalyticsPage = lazy(() => import("@/pages/Admin/SalesAnalyticsPage"));
const AdminOrdersPage = lazy(() => import("@/pages/Admin/OrdersPage"));
const AdminProductsPage = lazy(() => import("@/pages/Admin/ProductsPage"));
const AdminCustomersPage = lazy(() => import("@/pages/Admin/CustomersPage"));
const AdminMarketingPage = lazy(() => import("@/pages/Admin/MarketingPage"));
const AdminEmailMarketingPage = lazy(() => import("@/pages/Admin/EmailMarketingPage"));
const AdminMessagesPage = lazy(() => import("@/pages/Admin/MessagesPage"));
const CheckoutPage = lazy(() => import("@/pages/Checkout/CheckoutPage"));
const OrderSuccessPage = lazy(() => import("@/pages/OrderSuccess/OrderSuccessPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AdminRedirector = () => {
  const { loading, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;
    if (role !== "admin") return;
    if (location.pathname === "/admin") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }

    if (location.pathname.startsWith("/admin")) return;
    navigate("/admin/dashboard", { replace: true });
  }, [loading, isAuthenticated, role, location.pathname, navigate]);

  return null;
};

const AppRoutes = () => {
  const { loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AdminRedirector />
      <Routes>
        {/* Public Routes with MainLayout */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/product/:id" element={<ProductDetailsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/about-us" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-success" element={<OrderSuccessPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <CustomerDashboard />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Auth Routes (no layout) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Admin Route (blank page, no layout) */}
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminPage />
            </AdminProtectedRoute>
          }
        >
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="sales-analytics" element={<AdminSalesAnalyticsPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="customers" element={<AdminCustomersPage />} />
          <Route path="marketing" element={<AdminMarketingPage />} />
          <Route path="marketing/email" element={<AdminEmailMarketingPage />} />
          <Route path="messages" element={<AdminMessagesPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
