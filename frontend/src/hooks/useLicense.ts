import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAdmin } from "./useAdmin";

export function useLicense() {
  const [hasLicense, setHasLicense] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [checkedEmail, setCheckedEmail] = useState<string | null>(null);
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const userEmail = user?.email?.toLowerCase().trim() ?? "";
  const licenseKey = userEmail ? `noorfinance_license_${userEmail}` : "";
  const expiryKey = userEmail ? `noorfinance_expiry_${userEmail}` : "";

  useEffect(() => {
    if (isAdmin) {
      setHasLicense(true);
      setCheckedEmail(userEmail);
      setIsLoading(false);
      return;
    }

    setHasLicense(false);
    if (!userEmail) {
      setCheckedEmail(userEmail);
      setIsLoading(false);
      return;
    }

    const license = localStorage.getItem(licenseKey);
    const expiry = localStorage.getItem(expiryKey);
    const expiryDate = expiry ? new Date(expiry) : null;
    const licenseIsValid = Boolean(
      license &&
      expiryDate &&
      !Number.isNaN(expiryDate.getTime()) &&
      expiryDate > new Date(),
    );

    if (!licenseIsValid && (license || expiry)) {
      localStorage.removeItem(licenseKey);
      localStorage.removeItem(expiryKey);
    }

    setHasLicense(licenseIsValid);
    setCheckedEmail(userEmail);
    setIsLoading(false);
  }, [expiryKey, isAdmin, licenseKey, userEmail]);

  const activateLicense = (key: string) => {
    if (userEmail && key.trim().length >= 10) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 365);
      localStorage.setItem(licenseKey, key.trim());
      localStorage.setItem(expiryKey, expiry.toISOString());
      setHasLicense(true);
      return true;
    }
    return false;
  };

  return {
    hasLicense,
    isLoading: isLoading || checkedEmail !== userEmail,
    activateLicense,
    isAdmin,
    userEmail,
  };
}
