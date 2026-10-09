import { BrowserRouter, Route, Routes } from "react-router-dom";
import About from "./pages/About";
import Calculators from "./pages/Calculators";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import BondSukukCalculator from "./calculators/BondSukukCalculator";
import MurabahaCalculator from "./calculators/MurabahaCalculator";
import ZakatCalculator from "./calculators/ZakatCalculator";
import IjaraCalculator from "./calculators/IjaraCalculator";
import MusharakaCalculator from "./calculators/MusharakaCalculator";
import TakafulCalculator from "./calculators/TakafulCalculator";
import IslamicMortgageCalculator from "./calculators/IslamicMortgageCalculator";
import CalculatorLayout from "./components/CalculatorLayout";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { AuthProvider } from "./context/AuthContext";
import "./site.css";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="site-shell">
          <Navbar />
          <main className="site-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/calculators" element={<Calculators />} />
              <Route
                path="/calculators/bond-sukuk"
                element={
                  <CalculatorLayout
                    title="Bond & Sukuk Calculator"
                    description="Price conventional bonds and Ijara sukuk, compare cash flows, and export your schedule."
                  >
                    <BondSukukCalculator />
                  </CalculatorLayout>
                }
              />
              <Route
                path="/calculators/murabaha"
                element={
                  <CalculatorLayout
                    title="Murabaha Calculator"
                    description="Estimate the cost-plus sale price, monthly installments, and payment schedule."
                  >
                    <MurabahaCalculator />
                  </CalculatorLayout>
                }
              />
              <Route
                path="/calculators/zakat"
                element={
                  <CalculatorLayout
                    title="Zakat Calculator"
                    description="Estimate zakatable wealth against the gold nisab threshold."
                  >
                    <ZakatCalculator />
                  </CalculatorLayout>
                }
              />
              <Route
                path="/calculators/ijara"
                element={
                  <CalculatorLayout
                    title="Ijara / Halal Home Finance"
                    description="Explore an illustrative lease-to-own payment schedule with transparent rent and equity portions."
                  >
                    <IjaraCalculator />
                  </CalculatorLayout>
                }
              />
              <Route
                path="/calculators/musharaka"
                element={
                  <CalculatorLayout
                    title="Musharaka / Diminishing Musharaka"
                    description="Model a joint venture’s agreed profit sharing and an illustrative diminishing ownership buyout."
                  >
                    <MusharakaCalculator />
                  </CalculatorLayout>
                }
              />
              <Route
                path="/calculators/takaful"
                element={
                  <CalculatorLayout
                    title="Takaful Calculator"
                    description="Estimate an illustrative cooperative protection contribution, Tabarru pool, and potential surplus."
                  >
                    <TakafulCalculator />
                  </CalculatorLayout>
                }
              />
              <Route
                path="/calculators/islamic-mortgage"
                element={
                  <CalculatorLayout
                    title="Islamic Mortgage Calculator"
                    description="Compare illustrative Murabaha, Ijara, and Diminishing Musharakah home finance schedules."
                  >
                    <IslamicMortgageCalculator />
                  </CalculatorLayout>
                }
              />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
