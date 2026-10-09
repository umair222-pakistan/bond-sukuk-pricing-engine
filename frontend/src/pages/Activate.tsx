import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLicense } from '../hooks/useLicense';

export default function Activate() {
  const [key, setKey] = useState('');
  const navigate = useNavigate();
  const { activateLicense } = useLicense();

  const handleActivate = () => {
    if (activateLicense(key)) {
      alert('License Activated! Redirecting...');
      navigate('/calculators?free=true');
    } else {
      alert('Invalid license key. Key must be at least 10 characters.');
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFEF9' }}>
      <div style={{ background: 'white', padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '400px', border: '1px solid #e5e7eb' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0A2A12', marginBottom: '16px' }}>Activate Your License</h1>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Enter license key (e.g. NF-XXXX)" style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '16px' }} />
        <button onClick={handleActivate} style={{ width: '100%', background: '#0A2A12', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Activate & Unlock</button>
        <p style={{ marginTop: '12px', fontSize: '12px', color: '#888', textAlign: 'center' }}>After payment, you get key via email. For testing, enter any 10+ chars.</p>
      </div>
    </div>
  );
}
