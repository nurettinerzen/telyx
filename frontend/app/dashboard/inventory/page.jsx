'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function InventoryPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showErpModal, setShowErpModal] = useState(false);
  const [activeTab, setActiveTab] = useState('products');


  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    description: '',
    price: '',
    stockQuantity: '',
    lowStockThreshold: '',
    category: ''
  });

  const authFetch = (url, options = {}) =>
    fetch(url, {
      credentials: 'include',
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    });

  // Load user & inventory
  useEffect(() => {
    authFetch(`${API_URL}/api/auth/me`)
      .then(res => res.json())
      .then(data => {
        if (!data.id) return router.push('/login');
        setUser(data);
        setConnected(!!data.business?.googleSheetId);
        loadProducts(data.businessId);
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const loadProducts = async (businessId) => {
    try {
      const res = await authFetch(`${API_URL}/api/products?businessId=${businessId}`);
      const data = await res.json();
      setProducts(data || []);
    } catch (error) {
      console.error('Load error:', error);
    }
  };

  // Add Product
  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${API_URL}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newProduct,
          businessId: user.businessId,
          price: parseFloat(newProduct.price),
          stockQuantity: parseInt(newProduct.stockQuantity),
          lowStockThreshold: parseInt(newProduct.lowStockThreshold)
        })
      });

      if (res.ok) {
        alert('Product added.');
        setShowAddModal(false);
        setNewProduct({
          sku: '',
          name: '',
          description: '',
          price: '',
          stockQuantity: '',
          lowStockThreshold: '',
          category: ''
        });
        loadProducts(user.businessId);
      } else {
        alert('Failed to add product');
      }
    } catch (error) {
      console.error(error);
    }
  };

  // CSV Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch(`${API_URL}/api/inventory/products/import`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) return alert(data.error);
      alert(`Imported: ${data.imported}\nFailed: ${data.failed}`);

      setUploadResult(data);
      loadProducts(user.businessId);
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  <button
  onClick={() => setShowErpModal(true)}
  style={{
    padding: '10px 20px',
    background: '#8b5cf6',
    color: 'white',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    border: 'none'
  }}
>
  🔗 Connect ERP
</button>

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '50px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: '30px' }}>
        <h1>📦 Inventory Management</h1>
        <p>Manage your products and shipping</p>
      </div>

      {/* TABS */}
      <div style={{ borderBottom: '2px solid #e5e5e5', marginBottom: '25px' }}>
        <button
          onClick={() => setActiveTab('products')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'products' ? '3px solid #4f46e5' : 'none',
            cursor: 'pointer'
          }}
        >
          Products
        </button>

        <button
          onClick={() => setActiveTab('shipping')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'shipping' ? '3px solid #4f46e5' : 'none',
            cursor: 'pointer'
          }}
        >
          Shipping
        </button>
      </div>

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div>

          {/* CSV Upload Result */}
          {uploadResult && (
            <div style={{
              padding: '15px',
              marginBottom: '20px',
              background: uploadResult.failed > 0 ? '#fff3cd' : '#d4edda',
              borderRadius: '8px'
            }}>
              <strong>Imported:</strong> {uploadResult.imported} |{' '}
              <strong>Failed:</strong> {uploadResult.failed}
            </div>
          )}

          {/* TOOLBAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2>Products</h2>

            <div style={{ display: 'flex', gap: '10px' }}>

              {/* Template */}
              <a
                href={`${API_URL}/api/inventory/template`}
                download="inventory-template.csv"
                style={{
                  padding: '10px 20px',
                  background: '#10b981',
                  color: 'white',
                  borderRadius: '5px',
                  textDecoration: 'none',
                  fontWeight: 'bold'
                }}
              >
                📥 Template
              </a>

              {/* CSV Upload */}
              <label style={{
                padding: '10px 20px',
                background: '#006FEB',
                color: 'white',
                borderRadius: '5px',
                cursor: 'pointer'
              }}>
                {uploading ? '⏳ Uploading...' : '📤 Upload CSV'}
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>

              {/* Integrations Button */}
{/* Connect ERP Button */}
<button
  onClick={() => setShowErpModal(true)}
  style={{
    padding: '10px 20px',
    background: '#8b5cf6',
    color: 'white',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    border: 'none'
  }}
>
  🔗 Connect ERP
</button>

              {/* Add Product */}
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  padding: '10px 20px',
                  background: '#4f46e5',
                  color: 'white',
                  borderRadius: '5px'
                }}
              >
                + Add Product
              </button>

            </div>
          </div>

          {/* PRODUCT LIST */}
          {products.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center',
              background: '#f8f9fa',
              borderRadius: '10px'
            }}>
              <p style={{ fontSize: '20px', marginBottom: '10px' }}>📦 No products yet</p>
              <p>Add products manually or upload a CSV file.</p>
            </div>
          ) : (
            <div style={{
              background: 'white',
              borderRadius: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>SKU</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Product</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Stock</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '12px' }}>
                        <code>{product.sku}</code>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <strong>{product.name}</strong>
                        {product.description && (
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {product.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>{product.category || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>${product.price}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{product.stockQuantity}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: product.stockQuantity <= product.lowStockThreshold ? '#fee2e2' : '#e0f2fe',
                          color: product.stockQuantity <= product.lowStockThreshold ? '#b91c1c' : '#0369a1',
                          fontWeight: 'bold'
                        }}>
                          {product.stockQuantity <= product.lowStockThreshold ? '⚠️ Low Stock' : '✅ In Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ADD PRODUCT MODAL */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '500px'
          }}>
            <h2>Add New Product</h2>

            <form onSubmit={handleAddProduct}>
              <label>SKU *</label>
              <input
                type="text"
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                required
                style={inputStyle}
              />

              <label>Product Name *</label>
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                required
                style={inputStyle}
              />

              <label>Description</label>
              <textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                style={{ ...inputStyle, minHeight: '80px' }}
              />

              <label>Category</label>
              <input
                type="text"
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                style={inputStyle}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label>Price *</label>
                  <input
                    type="number"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    required
                    style={inputStyle}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label>Stock *</label>
                  <input
                    type="number"
                    value={newProduct.stockQuantity}
                    onChange={(e) => setNewProduct({ ...newProduct, stockQuantity: e.target.value })}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <label>Low Stock Threshold</label>
              <input
                type="number"
                value={newProduct.lowStockThreshold}
                onChange={(e) => setNewProduct({ ...newProduct, lowStockThreshold: e.target.value })}
                style={inputStyle}
              />

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#4f46e5',
                    color: 'white',
                    borderRadius: '6px'
                  }}
                >
                  Save
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#ddd',
                    borderRadius: '6px'
                  }}
                >
                  Cancel
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ERP MODAL */}
{showErpModal && (
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
      maxWidth: '500px',
      maxHeight: '90vh',
      overflow: 'auto'
    }}>
      <h2>Connect ERP System</h2>

      <form onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        try {
          const res = await authFetch(`${API_URL}/api/integrations/erp/connect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: formData.get('type'),
              apiEndpoint: formData.get('apiEndpoint'),
              apiKey: formData.get('apiKey'),
              username: formData.get('username'),
              password: formData.get('password'),
              companyCode: formData.get('companyCode'),
              realtimeMode: formData.get('realtimeMode') === 'on'
            })
          });

          if (res.ok) {
            alert('✅ ERP connected!');
            setShowErpModal(false);
          } else {
            alert('❌ Failed to connect');
          }
        } catch (error) {
          alert('Error connecting');
        }
      }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            ERP Type *
          </label>
          <select
            name="type"
            required
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ddd'
            }}
          >
            <option value="MIKRO">Mikro ERP</option>
            <option value="SAP">SAP</option>
            <option value="NETSUITE">NetSuite</option>
            <option value="ODOO">Odoo</option>
            <option value="CUSTOM">Custom API</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            API Endpoint *
          </label>
          <input
            type="url"
            name="apiEndpoint"
            placeholder="https://api.mikroerp.com/v1"
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
            API Key
          </label>
          <input
            type="text"
            name="apiKey"
            placeholder="Your API key"
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
            Username
          </label>
          <input
            type="text"
            name="username"
            placeholder="ERP username"
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
            Password
          </label>
          <input
            type="password"
            name="password"
            placeholder="ERP password"
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
            Company Code
          </label>
          <input
            type="text"
            name="companyCode"
            placeholder="001"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ddd'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" name="realtimeMode" />
            <span>Enable Real-time Mode</span>
          </label>
          <small style={{ color: '#666' }}>Query ERP on every stock check</small>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            style={{
              flex: 1,
              padding: '12px',
              background: '#4f46e5',
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
            onClick={() => setShowErpModal(false)}
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

const inputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #ccc',
  marginBottom: '15px'
};
