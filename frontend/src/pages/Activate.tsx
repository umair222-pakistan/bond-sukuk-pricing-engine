import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLicense } from '../hooks/useLicense';

export default function Activate() {
  const navigate = useNavigate();
  const { error, hasLicense, isLoading, refreshLicense, userEmail } = useLicense();

  useEffect(() => {
    if (!isLoading && !userEmail) {
      navigate('/signup?next=/activate', { replace: true });
    }
  }, [isLoading, navigate, userEmail]);

  useEffect(() => {
    if (!isLoading && hasLicense) {
      navigate('/calculators/bond-sukuk', { replace: true });
    }
  }, [hasLicense, isLoading, navigate]);

  if (isLoading || !userEmail) {
    return <div style={{padding: '40px', textAlign: 'center'}}>Checking your account...</div>;
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFEF9' }}>
      <div style={{ background: 'white', padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '400px', border: '1px solid #e5e7eb' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0A2A12', marginBottom: '16px' }}>Confirming Your License</h1>
        <p style={{ marginBottom: '16px' }}>Checking purchase for: <b>{userEmail}</b></p>
        <p role="status" style={{ marginBottom: '16px', color: error ? '#9b1c1c' : '#666' }}>
          {error ?? 'Your purchase is being checked. If you just completed checkout, allow a moment for the payment notification to arrive.'}
        </p>
        <button onClick={() => void refreshLicense()} disabled={isLoading} style={{ width: '100%', background: '#0A2A12', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Check License Status</button>
      </div>
    </div>
  );
}
