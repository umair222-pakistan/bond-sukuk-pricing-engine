import { Link } from 'react-router-dom';
import { useLicense } from '../hooks/useLicense';

export default function LicenseGate() {
  const { isAdmin, userEmail } = useLicense();

  if (isAdmin) return null;

  if (!userEmail) {
    return (
      <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', maxWidth: '500px', margin: '60px auto', border: '2px solid #0A2A12' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>👋</div>
        <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0A2A12', marginBottom: '10px' }}>Create Account First</h2>
        <p style={{ color: '#666', marginBottom: '24px' }}>Sign up to get your license assigned to your email. Takes 10 seconds.</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link to="/signup?next=/pricing" style={{ background: '#0A2A12', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>Sign Up Free →</Link>
          <Link to="/login?next=/pricing" style={{ background: 'white', color: '#0A2A12', border: '2px solid #0A2A12', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', maxWidth: '500px', margin: '60px auto', border: '2px solid #0A2A12' }}>
      <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
      <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0A2A12', marginBottom: '8px' }}>Premium Locked</h2>
      <p style={{ color: '#666', marginBottom: '6px' }}>Account: <b>{userEmail}</b></p>
      <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>Your license will be assigned to this email.</p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Link to="/pricing" style={{ background: '#0A2A12', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>View Pricing →</Link>
        <Link to="/activate" style={{ background: 'white', color: '#0A2A12', border: '2px solid #0A2A12', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>Activate License</Link>
      </div>
    </div>
  );
}
