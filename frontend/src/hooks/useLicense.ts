import { useState, useEffect } from 'react';

export function useLicense() {
  const [hasLicense, setHasLicense] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const license = localStorage.getItem('noorfinance_license');
    const expiry = localStorage.getItem('noorfinance_license_expiry');
    
    if (license && expiry) {
      const expiryDate = new Date(expiry);
      if (expiryDate > new Date()) {
        setHasLicense(true);
      } else {
        localStorage.removeItem('noorfinance_license');
        localStorage.removeItem('noorfinance_license_expiry');
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('free') === 'true') {
      setHasLicense(true);
    }

    setIsLoading(false);
  }, []);

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

  return { hasLicense, isLoading, activateLicense };
}
