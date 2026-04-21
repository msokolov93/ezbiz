import React, { useState, useRef, useMemo } from 'react';
import TinderCard from 'react-tinder-card';

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
  { txId: "TX991", amount: 1200.00, date: "2026-04-20", note: "Wire Transfer Initech", details: "Extraneous data to force a longer JSON block so we can test the scrolling capabilities inside the card. ID: 981273918273" },
  { txId: "TX992", amount: 340.00, date: "2026-04-21", note: "Stripe Payment", details: "Payment via portal." },
  { txId: "TX993", amount: 99.00, date: "2026-04-22", note: "Bank Fee Refund", details: "Adjustment" }
];

export default function ReconciliationPage({ 
  reconciledInvoices = MOCK_RECONCILED, 
  unreconciledInvoices = MOCK_UNRECONCILED, 
  transactions = MOCK_TRANSACTIONS 
}) {
  
  // --- State Management ---
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [completedMatches, setCompletedMatches] = useState([]);
  
  // Active Swiper Session State
  const [currentStack, setCurrentStack] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentIndexRef = useRef(currentIndex);
  
  const updateCurrentIndex = (val) => {
    setCurrentIndex(val);
    currentIndexRef.current = val;
  };

  // Dynamically generate refs based on the current stack size
  const childRefs = useMemo(
    () => Array(currentStack.length).fill(0).map(() => React.createRef()),
    [currentStack.length]
  );

  const canGoBack = currentIndex < currentStack.length - 1;
  const canSwipe = currentIndex >= 0;

  // --- Core Functions ---

  // 1. Triggered when an invoice is clicked in the Action table
  const handleInvoiceSelect = (inv) => {
    setSelectedInvoice(inv);
    
    // Find IDs of all transactions that have ALREADY been matched (swiped right)
    const matchedTxIds = completedMatches.map(match => match.transaction.txId);
    
    // Build a fresh stack of all transactions EXCEPT the ones successfully matched
    const availableTransactions = transactions.filter(tx => !matchedTxIds.includes(tx.txId));
    
    setCurrentStack(availableTransactions);
    updateCurrentIndex(availableTransactions.length - 1);
  };

  // 2. Triggered on Physical Drag or Button Swipe
  const swiped = (direction, tx, index) => {
    updateCurrentIndex(index - 1);

    if (direction === 'right') {
        console.log("MATCH MADE:", tx.txId, "with", selectedInvoice.id);
        setCompletedMatches(prev => [...prev, { invoice: selectedInvoice, transaction: tx }]);
    } else {
        console.log("SKIPPED transaction:", tx.txId);
    }
  };

  // 3. External Button Controls
  const swipe = async (dir) => {
    if (canSwipe && currentIndex < currentStack.length) {
      if (childRefs[currentIndex] && childRefs[currentIndex].current) {
        await childRefs[currentIndex].current.swipe(dir);
      }
    }
  };

  // 4. Undo Logic Fix
  const goBack = async () => {
    if (!canGoBack) return;
    const newIndex = currentIndex + 1;
    updateCurrentIndex(newIndex);
    
    // Restore the card physically on screen
    if (childRefs[newIndex] && childRefs[newIndex].current) {
      await childRefs[newIndex].current.restoreCard();
    }
    
    // If the card we brought back was previously matched, remove it from completedMatches
    const restoredTx = currentStack[newIndex];
    setCompletedMatches(prev => prev.filter(match => match.transaction.txId !== restoredTx.txId));
  };

  // 5. Complete Button logic
  const handleCompleteWork = async () => {
    const payload = JSON.stringify({ matches: completedMatches });
    console.log("COMPLETING WORK. Sending payload to backend:", payload);
    alert(`Work completed! ${completedMatches.length} matches securely saved. Check console for payload.`);
  };

  return (
    <div style={styles.container}>
      <style>{`
        .swipe {
          position: absolute;
          width: 100%;
          height: 100%;
        }
      `}</style>

      <h1 style={styles.header}>Invoice Reconciliation Dashboard</h1>

      {/* --- TABLE 1: Reconciled Invoices --- */}
      <div style={styles.tableWrapper}>
        <h2>Successfully Reconciled</h2>
        <table style={styles.table}>
          <tbody>
            {reconciledInvoices.map((inv, index) => (
              <tr 
                key={inv.id} 
                style={{ backgroundColor: index % 2 === 0 ? '#e8f5e9' : '#c8e6c9' }}
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
        <p style={{ fontSize: '14px', color: '#555' }}>
          Click an invoice below to begin. <strong>(Pro-tip: Click the row again to refresh the skipped cards!)</strong>
        </p>
        <table style={styles.table}>
          <tbody>
            {unreconciledInvoices.map((inv, index) => {
              const isSelected = selectedInvoice?.id === inv.id;
              // Small visual indicator if an invoice in this list has been matched during this session
              const hasSessionMatch = completedMatches.some(m => m.invoice.id === inv.id);

              return (
                <tr 
                  key={inv.id} 
                  onClick={() => handleInvoiceSelect(inv)}
                  style={{ 
                    backgroundColor: index % 2 === 0 ? '#ffebee' : '#ffcdd2',
                    border: isSelected ? '3px solid #d32f2f' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'border 0.2s ease'
                  }} 
                >
                  <td style={styles.cell}>
                    {isSelected ? <strong>[SELECTED] </strong> : null}
                    {hasSessionMatch ? <span>✅ </span> : null}
                    {inv.description}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* --- CONDITIONAL SWIPER INTERFACE --- */}
      <div style={styles.swiperSection}>
        <h2>Transaction Matcher</h2>
        
        {!selectedInvoice ? (
          <div style={styles.placeholderBox}>
             <h3>⚠️ Please select an unreconciled invoice above</h3>
             <p>The transaction matcher will appear once an invoice is targeted for reconciliation.</p>
          </div>
        ) : (
          <div style={styles.matcherContent}>
            
            {/* Adding the selectedInvoice.id as a Key forces React to completely 
               destroy and remount the stack container when switching invoices, 
               ensuring physical card positions perfectly reset.
            */}
            <div style={styles.cardStackContainer} key={selectedInvoice.id}>
              
              {currentIndex === -1 && (
                <div style={styles.emptyCard}>
                  <p>No more available transactions.</p>
                </div>
              )}

              {currentStack.map((tx, index) => (
                <TinderCard 
                  ref={childRefs[index]}
                  key={tx.txId} 
                  onSwipe={(dir) => swiped(dir, tx, index)} 
                  preventSwipe={['up', 'down']}
                  className="swipe" 
                >
                  <div style={styles.tinderCard}>
                    <div style={styles.cardHeader}>
                      <h3>Incoming Transaction</h3>
                    </div>
                    <div style={styles.jsonWrapper}>
                      <pre style={styles.jsonBlock}>
                        {JSON.stringify(tx, null, 2)}
                      </pre>
                    </div>
                  </div>
                </TinderCard>
              ))}
            </div>

            {/* External Tinder Buttons */}
            <div style={styles.buttonRow}>
              <button 
                style={{...styles.controlBtn, ...styles.btnLeft, opacity: canSwipe ? 1 : 0.5}} 
                onClick={() => swipe('left')}
                disabled={!canSwipe}
              >
                &#10006; Skip
              </button>
              <button 
                style={{...styles.controlBtn, ...styles.btnUndo, opacity: canGoBack ? 1 : 0.5}} 
                onClick={() => goBack()}
                disabled={!canGoBack}
              >
                &#8634; Undo
              </button>
              <button 
                style={{...styles.controlBtn, ...styles.btnRight, opacity: canSwipe ? 1 : 0.5}} 
                onClick={() => swipe('right')}
                disabled={!canSwipe}
              >
                &#10004; Match
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- COMPLETE BUTTON --- */}
      <div style={styles.footer}>
        <button style={styles.completeBtn} onClick={handleCompleteWork}>
          Complete Work ({completedMatches.length} Matches)
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
  swiperSection: {
    width: '80%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '40px',
    padding: '30px 20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '10px',
  },
  placeholderBox: {
    padding: '40px',
    border: '2px dashed #bbb',
    borderRadius: '10px',
    textAlign: 'center',
    color: '#555',
    width: '100%',
    maxWidth: '500px',
  },
  matcherContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  cardStackContainer: {
    width: '450px',
    height: '450px',
    position: 'relative', 
    marginTop: '10px',
    marginBottom: '20px',
  },
  tinderCard: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: '15px',
    boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
    padding: '20px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'grab',
    userSelect: 'none', 
  },
  cardHeader: {
    marginBottom: '10px',
    textAlign: 'center',
  },
  jsonWrapper: {
    flexGrow: 1, 
    overflowY: 'auto', 
    backgroundColor: '#2d2d2d',
    borderRadius: '8px',
  },
  jsonBlock: {
    margin: 0,
    padding: '15px',
    color: '#f8f8f2',
    fontSize: '15px',
    whiteSpace: 'pre-wrap', 
    wordBreak: 'break-all',
  },
  emptyCard: {
    position: 'absolute', 
    width: '100%',
    height: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: '15px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#666',
    textAlign: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '450px',
    marginTop: '10px',
  },
  controlBtn: {
    padding: '15px 20px',
    borderRadius: '50px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    transition: 'transform 0.1s',
  },
  btnLeft: {
    backgroundColor: '#fff',
    border: '2px solid #ff4b4b',
    color: '#ff4b4b',
  },
  btnUndo: {
    backgroundColor: '#fff',
    border: '2px solid #fbc02d',
    color: '#fbc02d',
  },
  btnRight: {
    backgroundColor: '#fff',
    border: '2px solid #4caf50',
    color: '#4caf50',
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