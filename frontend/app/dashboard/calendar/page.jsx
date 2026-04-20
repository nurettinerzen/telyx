'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function CalendarPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [viewMode, setViewMode] = useState('list');

  const [newAppointment, setNewAppointment] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    appointmentDate: '',
    duration: 30,
    serviceType: '',
    notes: ''
  });

  const authFetch = (url, options = {}) =>
    fetch(url, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    });

  useEffect(() => {
    authFetch(`${API_URL}/api/auth/me`)
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setUser(data);
          loadAppointments();
        } else {
          router.push('/login');
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const loadAppointments = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/appointments`);
      const data = await res.json();
      setAppointments(data || []);
    } catch (error) {
      console.error('Load appointments error:', error);
    }
  };

  const handleAddAppointment = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${API_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newAppointment)
      });

      if (res.ok) {
        alert('Appointment created!');
        setShowAddModal(false);
        setNewAppointment({
          customerName: '',
          customerPhone: '',
          customerEmail: '',
          appointmentDate: '',
          duration: 30,
          serviceType: '',
          notes: ''
        });
        loadAppointments();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create appointment');
      }
    } catch (error) {
      console.error('Add appointment error:', error);
      alert('Error creating appointment');
    }
  };

  const handleCancelAppointment = async (id) => {
    if (!confirm('Cancel this appointment?')) return;

    try {
      const res = await authFetch(`${API_URL}/api/appointments/${id}`, { method: 'DELETE' });

      if (res.ok) {
        alert('Appointment cancelled');
        loadAppointments();
      }
    } catch (error) {
      console.error('Cancel appointment error:', error);
    }
  };

  const handleConnectPlatform = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
      const res = await authFetch(`${API_URL}/api/integrations/reservation/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platform: 'OPENTABLE',
          apiKey: formData.get('apiKey'),
          restaurantId: formData.get('restaurantId')
        })
      });

      if (res.ok) {
        alert('✅ Connected!');
        setShowReservationModal(false);
      } else {
        alert('❌ Failed to connect');
      }
    } catch (error) {
      alert('Error connecting');
    }
  };

const handleConnectBooking = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  
  try {
    const res = await authFetch(`${API_URL}/api/integrations/booking/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platform: 'BOOKSY',
        apiKey: formData.get('apiKey'),
        shopId: formData.get('shopId')
      })
    });

    if (res.ok) {
      alert('✅ Connected to Booksy!');
      setShowBookingModal(false);
    } else {
      alert('❌ Failed to connect');
    }
  } catch (error) {
    alert('Error connecting');
  }
};

  const getStatusColor = (status) => {
    switch(status) {
      case 'CONFIRMED': return '#10b981';
      case 'PENDING': return '#f59e0b';
      case 'CANCELLED': return '#ef4444';
      case 'COMPLETED': return '#6b7280';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
  }

  const businessType = user?.business?.businessType;
  const pageTitle = businessType === 'RESTAURANT' ? 'Reservations' : 'Appointments';

  return (
    <div style={{ padding: '50px' }}>

      {/* Header */}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
  <div>
    <h1 style={{ margin: '0 0 10px 0' }}>📅 {pageTitle}</h1>
    <p style={{ margin: 0, color: '#666' }}>Manage your bookings and schedule</p>
  </div>
  
  <div style={{ display: 'flex', gap: '10px' }}>
    <button
      onClick={() => setShowAddModal(true)}
      style={{
        padding: '12px 24px',
        background: '#4f46e5',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      }}
    >
      + New {businessType === 'RESTAURANT' ? 'Reservation' : 'Appointment'}
    </button>
    
    {/* RESTAURANT için OpenTable */}
    {businessType === 'RESTAURANT' && (
      <button
        onClick={() => setShowReservationModal(true)}
        style={{
          padding: '12px 24px',
          background: '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        🔗 Connect Platform
      </button>
    )}

    {/* SALON için Booksy */}
    {businessType === 'SALON' && (
      <button
        onClick={() => setShowBookingModal(true)}
        style={{
          padding: '12px 24px',
          background: '#8b5cf6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        🔗 Connect Platform
      </button>
    )}
  </div>
</div>

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {appointments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', background: '#f9f9f9', borderRadius: '10px', color: '#666' }}>
              <p style={{ fontSize: '18px', margin: '0 0 10px 0' }}>📭 No {pageTitle.toLowerCase()} yet</p>
              <p style={{ margin: 0 }}>Click &quot;New {businessType === 'RESTAURANT' ? 'Reservation' : 'Appointment'}&quot; to get started</p>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '15px', textAlign: 'left' }}>Date & Time</th>
                    <th style={{ padding: '15px', textAlign: 'left' }}>Customer</th>
                    <th style={{ padding: '15px', textAlign: 'left' }}>Contact</th>
                    <th style={{ padding: '15px', textAlign: 'left' }}>Service</th>
                    <th style={{ padding: '15px', textAlign: 'center' }}>Duration</th>
                    <th style={{ padding: '15px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '15px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(apt => (
                    <tr key={apt.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                      <td style={{ padding: '15px' }}>
                        {new Date(apt.appointmentDate).toLocaleString(getIntlLocale(locale), {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td style={{ padding: '15px' }}>
                        <strong>{apt.customerName}</strong>
                      </td>
                      <td style={{ padding: '15px' }}>
                        <div style={{ fontSize: '13px' }}>
                          {apt.customerPhone && <div>📞 {apt.customerPhone}</div>}
                          {apt.customerEmail && <div>📧 {apt.customerEmail}</div>}
                        </div>
                      </td>
                      <td style={{ padding: '15px' }}>{apt.serviceType || '-'}</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>{apt.duration} min</td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        <span style={{
                          padding: '5px 10px',
                          borderRadius: '5px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          background: getStatusColor(apt.status) + '20',
                          color: getStatusColor(apt.status)
                        }}>
                          {apt.status}
                        </span>
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }}>
                        {apt.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCancelAppointment(apt.id)}
                            style={{
                              padding: '5px 12px',
                              background: '#fee',
                              color: '#c00',
                              border: '1px solid #fcc',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Other Views */}
      {viewMode !== 'list' && (
        <div style={{ textAlign: 'center', padding: '60px', background: '#f9f9f9', borderRadius: '10px', color: '#666' }}>
          <p style={{ fontSize: '18px', margin: 0 }}>
            {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} view coming soon!
          </p>
        </div>
      )}

      {/* Add Appointment Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '30px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>New {businessType === 'RESTAURANT' ? 'Reservation' : 'Appointment'}</h2>
            <form onSubmit={handleAddAppointment}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Customer Name *</label>
                <input
                  type="text"
                  value={newAppointment.customerName}
                  onChange={(e) => setNewAppointment({...newAppointment, customerName: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Phone *</label>
                <input
                  type="tel"
                  value={newAppointment.customerPhone}
                  onChange={(e) => setNewAppointment({...newAppointment, customerPhone: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email</label>
                <input
                  type="email"
                  value={newAppointment.customerEmail}
                  onChange={(e) => setNewAppointment({...newAppointment, customerEmail: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date & Time *</label>
                <input
                  type="datetime-local"
                  value={newAppointment.appointmentDate}
                  onChange={(e) => setNewAppointment({...newAppointment, appointmentDate: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Duration (min) *</label>
                  <input
                    type="number"
                    value={newAppointment.duration}
                    onChange={(e) => setNewAppointment({...newAppointment, duration: parseInt(e.target.value)})}
                    style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Service Type</label>
                  <input
                    type="text"
                    value={newAppointment.serviceType}
                    onChange={(e) => setNewAppointment({...newAppointment, serviceType: e.target.value})}
                    style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                    placeholder="Haircut, Dinner, etc."
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notes</label>
                <textarea
                  value={newAppointment.notes}
                  onChange={(e) => setNewAppointment({...newAppointment, notes: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd', minHeight: '80px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="submit"
                  style={{ flex: 1, padding: '12px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Create {businessType === 'RESTAURANT' ? 'Reservation' : 'Appointment'}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: '12px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect Platform Modal */}
      {showReservationModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '500px' }}>
            <h2>Connect Reservation Platform</h2>

            <form onSubmit={handleConnectPlatform}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Platform</label>
                <select style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
                  <option>OpenTable</option>
                  <option disabled>Yelp (Coming soon)</option>
                  <option disabled>Resy (Coming soon)</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>API Key *</label>
                <input
                  type="text"
                  name="apiKey"
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Restaurant ID *</label>
                <input
                  type="text"
                  name="restaurantId"
                  required
                  placeholder="12345"
                  style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Connect
                </button>
                <button
                  type="button"
                  onClick={() => setShowReservationModal(false)}
                  style={{ flex: 1, padding: '12px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

{/* BOOKSY MODAL - SALON */}
{showBookingModal && (
  <div style={{
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  }}>
    <div style={{
      background: 'white',
      padding: '30px',
      borderRadius: '10px',
      width: '90%',
      maxWidth: '500px'
    }}>
      <h2>Connect Booking Platform</h2>

      <form onSubmit={handleConnectBooking}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Platform
          </label>
          <select style={{
            width: '100%',
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid #ddd'
          }}>
            <option>Booksy</option>
            <option disabled>Fresha (Coming soon)</option>
            <option disabled>Square (Coming soon)</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            API Key *
          </label>
          <input
            type="text"
            name="apiKey"
            required
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ddd'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Shop ID *
          </label>
          <input
            type="text"
            name="shopId"
            required
            placeholder="12345"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ddd'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            style={{
              flex: 1,
              padding: '12px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => setShowBookingModal(false)}
            style={{
              flex: 1,
              padding: '12px',
              background: '#e5e7eb',
              color: '#374151',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
)}

    </div>
  );
}
