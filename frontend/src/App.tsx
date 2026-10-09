import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import About from "./pages/About";
import Activate from "./pages/Activate";
import Calculators from "./pages/Calculators";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
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
import LicenseGate from "./components/LicenseGate";
import { useLicense } from "./hooks/useLicense";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { AuthProvider } from "./context/AuthContext";
import "./site.css";
import Pricing from "./components/Pricing";

function LicensedCalculator({ children }: { children: ReactNode }) {
  const { error, hasLicense, isAdmin, isLoading, userEmail } = useLicense();

  if (isLoading) {
    return <div style={{padding: "40px", textAlign: "center"}}>Loading...</div>;
  }
  if (!hasLicense) {
    return <LicenseGate error={error} isAdmin={isAdmin} userEmail={userEmail} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="site-shell">
          <Navbar />
          <main className="site-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/calculators" element={<Calculators />} />
              <Route path="/activate" element={<Activate />} />
              <Route
                path="/calculators/bond-sukuk"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Bond & Sukuk Calculator"
                      description="Price conventional bonds and Ijara sukuk, compare cash flows, and export your schedule."
                    >
                      <BondSukukCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
                }
              />
              <Route
                path="/calculators/murabaha"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Murabaha Calculator"
                      description="Estimate the cost-plus sale price, monthly installments, and payment schedule."
                    >
                      <MurabahaCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
                }
              />
              <Route
                path="/calculators/zakat"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Zakat Calculator"
                      description="Estimate zakatable wealth against the gold nisab threshold."
                    >
                      <ZakatCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
                }
              />
              <Route
                path="/calculators/ijara"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Ijara / Halal Home Finance"
                      description="Explore an illustrative lease-to-own payment schedule with transparent rent and equity portions."
                    >
                      <IjaraCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
                }
              />
              <Route
                path="/calculators/musharaka"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Musharaka / Diminishing Musharaka"
                      description="Model a joint venture’s agreed profit sharing and an illustrative diminishing ownership buyout."
                    >
                      <MusharakaCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
                }
              />
              <Route
                path="/calculators/takaful"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Takaful Calculator"
                      description="Estimate an illustrative cooperative protection contribution, Tabarru pool, and potential surplus."
                    >
                      <TakafulCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
                }
              />
              <Route
                path="/calculators/islamic-mortgage"
                element={
                  <LicensedCalculator>
                    <CalculatorLayout
                      title="Islamic Mortgage Calculator"
                      description="Compare illustrative Murabaha, Ijara, and Diminishing Musharakah home finance schedules."
                    >
                      <IslamicMortgageCalculator />
                    </CalculatorLayout>
                  </LicensedCalculator>
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
