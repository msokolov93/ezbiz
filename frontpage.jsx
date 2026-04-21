import React, { useState } from 'react';

// --- Mock Data Inputs ---
const MOCK_RECONCILED = [
  { id: 1, description: "Invoice #1001 - Acme Corp - $500.00 - Paid" },
  { id: 2, description: "Invoice #1002 - Globex - $150.00 - Paid" },
];

const MOCK_UNRECONCILED = [
  { id: 3, description: "Invoice #1003 - Initech - $1,200.00 - Pending" },
  { id: 4, description: "Invoice #1004 - Soylent Corp - $340.00 - Pending" },
];

const MOCK_TRANSACTIONS = [
  { txId: "TX991", amount: 1200.00, date: "2026-04-20", note: "Wire Transfer Initech" },
  { txId: "TX992", amount: 340.00, date: "2026-04-21", note: "Stripe Payment" },
];

export default function ReconciliationPage({ 
  reconciledInvoices = MOCK_RECONCILED, 
  unreconciledInvoices = MOCK_UNRECONCILED, 
  transactions = MOCK_TRANSACTIONS 
}) {
  
  // --- State Management ---
  const [activeTxIndex, setActiveTxIndex] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [completedMatches, setCompletedMatches] = useState([]);

  // --- Core Functions ---

  // 1. Swipe Right (Match)
  const handleSwipeRight = (transaction) => {
    if (!selectedInvoice) {
      alert("Please select an unreconciled invoice from the table first!");
      return;
    }

    // TODO: Add your custom match logic here
    console.log("SWIPE RIGHT DETECTED:");
    console.log("Matched Transaction:", transaction);
    console.log("Matched Invoice:", selectedInvoice);

    // Save progress locally
    setCompletedMatches([...completedMatches, { invoice: selectedInvoice, transaction }]);
    
    // Move to next card
    setActiveTxIndex(prev => prev + 1);
  };

  // 2. Swipe Left (Skip)
  const handleSwipeLeft = () => {
    // Move to next card without doing anything
    setActiveTxIndex(prev => prev + 1);
  };

  // 3. Complete Work (API Call)
  const handleCompleteWork = async () => {
    const payload = JSON.stringify({ matches: completedMatches });
    
    // TODO: Add your Fastify backend API call here
    console.log("COMPLETING WORK. Sending payload to backend:", payload);
    
    /* Example implementation:
    try {
      const response = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      if (response.ok) alert("Progress saved successfully!");
    } catch (error) {
      console.error("Failed to save progress", error);
    }
    */
    alert("Work completed! Check console for payload.");
  };

  // --- Render Helpers ---
  const currentTransaction = transactions[activeTxIndex];

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Invoice Reconciliation Dashboard</h1>

      {/* --- TABLE 1: Reconciled Invoices --- */}
      <div style={styles.tableWrapper}>
        <h2>Successfully Reconciled</h2>
        <table style={styles.table}>
          <tbody>
            {reconciledInvoices.map((inv, index) => (
              <tr 
                key={inv.id} 
                style={{ backgroundColor: index % 2 === 0 ? '#e8f5e9' : '#c8e6c9' }} // Alternating Light Green
              >
                <td style={styles.cell}>{inv.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- TABLE 2: Unreconciled Invoices --- */}
      <div style={styles.tableWrapper}>
        <h2>Action Required: Unreconciled Invoices</h2>
        <p style={{ fontSize: '14px', color: '#555' }}>Click a row below to select it for the swiper.</p>
        <table style={styles.table}>
          <tbody>
            {unreconciledInvoices.map((inv, index) => {
              const isSelected = selectedInvoice?.id === inv.id;
              return (
                <tr 
                  key={inv.id} 
                  onClick={() => setSelectedInvoice(inv)}
                  style={{ 
                    backgroundColor: index % 2 === 0 ? '#ffebee' : '#ffcdd2', // Alternating Light Red
                    border: isSelected ? '2px solid #d32f2f' : 'none',
                    cursor: 'pointer'
                  }} 
                >
                  <td style={styles.cell}>
                    {isSelected ? <strong>[SELECTED] </strong> : null}
                    {inv.description}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* --- SWIPER INTERFACE --- */}
      <div style={styles.swiperContainer}>
        <h2>Transaction Matcher</h2>
        {currentTransaction ? (
          <div style={styles.card}>
            <h3>Incoming Transaction</h3>
            <pre style={styles.jsonBlock}>
              {JSON.stringify(currentTransaction, null, 2)}
            </pre>
            <div style={styles.buttonGroup}>
              <button style={styles.swipeLeftBtn} onClick={handleSwipeLeft}>
                &larr; Swipe Left (Skip)
              </button>
              <button style={styles.swipeRightBtn} onClick={() => handleSwipeRight(currentTransaction)}>
                Swipe Right (Match) &rarr;
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.emptyCard}>
            <p>No more transactions left to review.</p>
          </div>
        )}
      </div>

      {/* --- COMPLETE BUTTON --- */}
      <div style={styles.footer}>
        <button style={styles.completeBtn} onClick={handleCompleteWork}>
          Complete Work & Save Progress
        </button>
      </div>
    </div>
  );
}

// --- CSS-in-JS Styling ---
const styles = {
  container: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  header: {
    color: '#333',
    marginBottom: '30px',
  },
  tableWrapper: {
    width: '80%',
    marginBottom: '40px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  cell: {
    padding: '15px',
    borderBottom: '1px solid #ddd',
    fontSize: '16px',
  },
  swiperContainer: {
    width: '80%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '40px',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '10px',
  },
  card: {
    width: '400px',
    backgroundColor: '#fff',
    borderRadius: '15px',
    boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
    padding: '20px',
    textAlign: 'center',
  },
  emptyCard: {
    width: '400px',
    padding: '40px 20px',
    backgroundColor: '#e0e0e0',
    borderRadius: '15px',
    textAlign: 'center',
    color: '#666',
  },
  jsonBlock: {
    textAlign: 'left',
    backgroundColor: '#2d2d2d',
    color: '#f8f8f2',
    padding: '15px',
    borderRadius: '5px',
    overflowX: 'auto',
    fontSize: '14px',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '20px',
  },
  swipeLeftBtn: {
    padding: '12px 20px',
    backgroundColor: '#fff',
    border: '2px solid #ff4b4b',
    color: '#ff4b4b',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  swipeRightBtn: {
    padding: '12px 20px',
    backgroundColor: '#4caf50',
    border: 'none',
    color: '#fff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  footer: {
    width: '80%',
    textAlign: 'center',
    paddingTop: '20px',
    borderTop: '2px solid #eee',
  },
  completeBtn: {
    padding: '15px 30px',
    backgroundColor: '#2196f3',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  }
};