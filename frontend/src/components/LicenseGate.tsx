import { Link } from 'react-router-dom';

export default function LicenseGate() {
  return (
    <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', maxWidth: '500px', margin: '60px auto', border: '2px solid #0A2A12', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
      <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
      <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0A2A12', marginBottom: '12px' }}>Premium Calculator Locked</h2>
      <p style={{ color: '#666', marginBottom: '24px', fontSize: '15px' }}>This Islamic finance calculator is for Pro users only. Get instant access with Shariah-compliant PDF reports.</p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Link to="/pricing" style={{ background: '#0A2A12', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>View Pricing →</Link>
        <Link to="/activate" style={{ background: 'white', color: '#0A2A12', border: '2px solid #0A2A12', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }}>Activate License</Link>
      </div>
    </div>
  );
}
