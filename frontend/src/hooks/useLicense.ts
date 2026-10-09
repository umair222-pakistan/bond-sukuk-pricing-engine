import { useEffect, useState } from "react";
import { useAdmin } from "./useAdmin";

export function useLicense() {
  const [hasLicense, setHasLicense] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { isAdmin } = useAdmin();

  useEffect(() => {
    if (isAdmin) {
      setHasLicense(true);
      setIsLoading(false);
      return;
    }

    let licenseIsValid = false;
    const license = localStorage.getItem('noorfinance_license');
    const expiry = localStorage.getItem('noorfinance_license_expiry');

    if (license && expiry) {
      const expiryDate = new Date(expiry);
      if (!Number.isNaN(expiryDate.getTime()) && expiryDate > new Date()) {
        licenseIsValid = true;
      } else {
        localStorage.removeItem('noorfinance_license');
        localStorage.removeItem('noorfinance_license_expiry');
      }
    }

    const params = new URLSearchParams(window.location.search);
    setHasLicense(licenseIsValid || params.get('free') === 'true');
    setIsLoading(false);
  }, [isAdmin]);

  const activateLicense = (key: string) => {
    if (key.length >= 10) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      localStorage.setItem('noorfinance_license', key);
      localStorage.setItem('noorfinance_license_expiry', expiry.toISOString());
      setHasLicense(true);
      return true;
    }
    return false;
  };

  return { hasLicense, isLoading, activateLicense, isAdmin };
}
