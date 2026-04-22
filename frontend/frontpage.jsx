import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import TinderCard from 'react-tinder-card';

export default function ReconciliationPage() {
  
  // --- Auth State ---
  const [token, setToken] = useState(() => sessionStorage.getItem('recon_token'));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const authFetch = useCallback((url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}` },
    });
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Login failed'); return; }
      sessionStorage.setItem('recon_token', data.token);
      setToken(data.token);
    } catch {
      setLoginError('Connection error — is the backend running?');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('recon_token');
    setToken(null);
  };

  // --- Data State ---
  const [reconciledInvoices, setReconciledInvoices] = useState([]);
  const [unreconciledInvoices, setUnreconciledInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Visibility State ---
  const [showReconciled, setShowReconciled] = useState(true);
  const [showUnreconciled, setShowUnreconciled] = useState(true);

  // --- Sorting State (Independent per table) ---
  const [sortReconciled, setSortReconciled] = useState({ key: 'id', direction: 'asc' });
  const [sortUnreconciled, setSortUnreconciled] = useState({ key: 'id', direction: 'asc' });

  // --- Invoice Detail Panel ---
  const [detailInvoiceId, setDetailInvoiceId] = useState(null);
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const handleInvoiceDetail = async (id) => {
    if (detailInvoiceId === id) {
      setDetailInvoiceId(null);
      setInvoiceDetail(null);
      return;
    }
    setDetailInvoiceId(id);
    setInvoiceDetail(null);
    setIsLoadingDetail(true);
    try {
      const res = await authFetch(`/api/invoices/${id}`);
      const data = await res.json();
      setInvoiceDetail(data);
    } catch (err) {
      console.error('Failed to fetch invoice detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // --- Swiper State ---
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [completedMatches, setCompletedMatches] = useState([]);
  const [currentStack, setCurrentStack] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentIndexRef = useRef(currentIndex);

  // --- Initialization (API Call on Load) ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await authFetch('/api/dashboard-report');
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        
        const processedUnreconciled = (data.unreconciled_invoices || []).map(inv => {
          const total = parseFloat(inv.total || 0);
          const remaining = inv.remaining_balance !== undefined ? parseFloat(inv.remaining_balance) : total;
          const paid = inv.amount_paid !== undefined ? parseFloat(inv.amount_paid) : (total - remaining);
          
          return { ...inv, amount_paid: paid };
        });

        setReconciledInvoices(data.reconciled_invoices || []);
        setUnreconciledInvoices(processedUnreconciled);
        setTransactions(data.pending_transactions || []);
        
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        alert('Failed to load dashboard data. Make sure the backend is running.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [authFetch]);

  // --- Sorting Logic ---
  const handleSort = (tableType, key) => {
    if (tableType === 'reconciled') {
      let direction = 'asc';
      if (sortReconciled.key === key && sortReconciled.direction === 'asc') direction = 'desc';
      setSortReconciled({ key, direction });
    } else {
      let direction = 'asc';
      if (sortUnreconciled.key === key && sortUnreconciled.direction === 'asc') direction = 'desc';
      setSortUnreconciled({ key, direction });
    }
  };

  const sortData = (data, config) => {
    if (!config.key || !data) return data;
    return [...data].sort((a, b) => {
      let valA = a[config.key];
      let valB = b[config.key];

      if (config.key === 'total' || config.key === 'amount_paid') {
        valA = parseFloat(valA || 0);
        valB = parseFloat(valB || 0);
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // --- Company Filter ---
  const [companyFilter, setCompanyFilter] = useState('ALL');

  const companyNames = useMemo(() => {
    const names = new Set();
    [...reconciledInvoices, ...unreconciledInvoices].forEach(inv => {
      if (inv.customer_name) names.add(inv.customer_name);
    });
    return ['ALL', ...Array.from(names).sort()];
  }, [reconciledInvoices, unreconciledInvoices]);

  const sortedReconciled = useMemo(() => {
    const sorted = sortData(reconciledInvoices, sortReconciled);
    return companyFilter === 'ALL' ? sorted : sorted.filter(inv => inv.customer_name === companyFilter);
  }, [reconciledInvoices, sortReconciled, companyFilter]);

  const sortedUnreconciled = useMemo(() => {
    const sorted = sortData(unreconciledInvoices, sortUnreconciled);
    return companyFilter === 'ALL' ? sorted : sorted.filter(inv => inv.customer_name === companyFilter);
  }, [unreconciledInvoices, sortUnreconciled, companyFilter]);

  const companySummary = useMemo(() => {
    if (companyFilter === 'ALL') return null;
    const allFiltered = [...reconciledInvoices, ...unreconciledInvoices]
      .filter(inv => inv.customer_name === companyFilter);
    const total = allFiltered.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const paid  = allFiltered.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
    return { total, paid, difference: total - paid };
  }, [companyFilter, reconciledInvoices, unreconciledInvoices]);

  // Running pending amount per invoice from right-swipe matches this session
  const pendingByInvoice = useMemo(() => {
    return completedMatches.reduce((map, m) => {
      map[m.invoice_id] = (map[m.invoice_id] || 0) + m.amount;
      return map;
    }, {});
  }, [completedMatches]);

  const getSortIndicator = (config, key) => {
    if (config.key !== key) return ' ↕';
    return config.direction === 'asc' ? ' ↑' : ' ↓';
  };

  // --- Swiper Logic ---
  const updateCurrentIndex = (val) => {
    setCurrentIndex(val);
    currentIndexRef.current = val;
  };

  const childRefs = useMemo(
    () => Array(currentStack.length).fill(0).map(() => React.createRef()),
    [currentStack.length, selectedInvoice?.id]
  );

  const canGoBack = currentIndex < currentStack.length - 1;
  const canSwipe = currentIndex >= 0;

  const handleInvoiceSelect = (inv) => {
    setSelectedInvoice(inv);
    const matchedTxIds = completedMatches.map(match => match.transaction_id);
    const availableTransactions = transactions.filter(tx => !matchedTxIds.includes(tx.id));
    setCurrentStack(availableTransactions);
    updateCurrentIndex(availableTransactions.length - 1);
  };

  const swiped = (direction, tx, index) => {
    updateCurrentIndex(index - 1);
    if (direction === 'right') {
      setCompletedMatches(prev => {
        const alreadyPending = prev
          .filter(m => m.invoice_id === selectedInvoice.id)
          .reduce((sum, m) => sum + m.amount, 0);
        const remaining = parseFloat(selectedInvoice.total || 0) - parseFloat(selectedInvoice.amount_paid || 0) - alreadyPending;
        const amount = Math.min(parseFloat(tx.unapplied_amount || 0), Math.max(0, remaining));
        return [...prev, { invoice_id: selectedInvoice.id, transaction_id: tx.id, amount }];
      });
    }
  };

  const swipe = async (dir) => {
    if (canSwipe && currentIndex < currentStack.length) {
      if (childRefs[currentIndex] && childRefs[currentIndex].current) {
        await childRefs[currentIndex].current.swipe(dir);
      }
    }
  };

  const goBack = async () => {
    if (!canGoBack) return;
    const newIndex = currentIndex + 1;
    updateCurrentIndex(newIndex);
    if (childRefs[newIndex] && childRefs[newIndex].current) {
      await childRefs[newIndex].current.restoreCard();
    }
    const restoredTx = currentStack[newIndex];
    setCompletedMatches(prev => prev.filter(match => match.transaction_id !== restoredTx.id));
  };

  const handleCompleteWork = async () => {
    if (completedMatches.length === 0) {
      alert("No matches to save!");
      return;
    }

    try {
      for (const { invoice_id, transaction_id, amount } of completedMatches) {
        const response = await authFetch('/api/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_id, transaction_id, amount })
        });
        if (!response.ok) throw new Error(`Failed to reconcile ${invoice_id} with ${transaction_id}`);
      }

      alert(`Work completed! ${completedMatches.length} match(es) saved.`);
      window.location.reload();
    } catch (error) {
      console.error("Error saving progress:", error);
      alert("Failed to save progress. Check your console and backend logs.");
    }
  };

  if (!token) {
    return (
      <div style={styles.loginWrapper}>
        <div style={styles.loginBox}>
          <h1 style={styles.loginTitle}>ReconSwipe</h1>
          <form onSubmit={handleLogin} style={styles.loginForm}>
            <input
              style={styles.loginInput}
              type="text"
              placeholder="Username"
              value={loginUsername}
              onChange={e => setLoginUsername(e.target.value)}
              autoFocus
            />
            <input
              style={styles.loginInput}
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
            />
            {loginError && <div style={styles.loginError}>{loginError}</div>}
            <button style={styles.loginBtn} type="submit">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ textAlign: 'center', marginTop: '50px', fontSize: '20px' }}>Loading Dashboard Data...</div>;
  }

  return (
    <div style={styles.container}>
      <style>{`.swipe { position: absolute; width: 100%; height: 100%; }`}</style>
      <div style={styles.topBar}>
        <h1 style={styles.header}>Welcome to ReconSwipe!</h1>
        <button style={styles.logoutBtn} onClick={handleLogout}>Sign Out</button>
      </div>
      <div style={styles.filterBar}>
        <label style={styles.filterLabel} htmlFor="company-filter">Company</label>
        <select
          id="company-filter"
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value)}
          style={styles.filterSelect}
        >
          {companyNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      {companySummary && (
        <div style={styles.summaryBar}>
          <div style={styles.summaryItem}><span style={styles.summaryLabel}>Total</span><span style={styles.summaryValue}>${companySummary.total.toFixed(2)}</span></div>
          <div style={styles.summaryItem}><span style={styles.summaryLabel}>Paid</span><span style={styles.summaryValue}>${companySummary.paid.toFixed(2)}</span></div>
          <div style={styles.summaryItem}><span style={styles.summaryLabel}>Difference</span><span style={{...styles.summaryValue, color: companySummary.difference <= 0 ? '#2e7d32' : '#c62828'}}>${companySummary.difference.toFixed(2)}</span></div>
        </div>
      )}

      {/* --- TABLE 1: Reconciled Invoices --- */}
      <div style={styles.tableWrapper}>
        <div style={styles.tableHeaderSection}>
          <h2>Successfully Reconciled</h2>
          <button style={styles.toggleBtn} onClick={() => setShowReconciled(!showReconciled)}>
            {showReconciled ? 'Hide Table ⏶' : 'Show Table ⏷'}
          </button>
        </div>
        
        {showReconciled && (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th} onClick={() => handleSort('reconciled', 'id')}>Invoice ID{getSortIndicator(sortReconciled, 'id')}</th>
                {/* Updated to customer_name */}
                <th style={styles.th} onClick={() => handleSort('reconciled', 'customer_name')}>Customer{getSortIndicator(sortReconciled, 'customer_name')}</th>
                <th style={styles.th} onClick={() => handleSort('reconciled', 'total')}>Total{getSortIndicator(sortReconciled, 'total')}</th>
                <th style={styles.th} onClick={() => handleSort('reconciled', 'amount_paid')}>Amount Paid{getSortIndicator(sortReconciled, 'amount_paid')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedReconciled.map((inv, index) => (
                <React.Fragment key={inv.id}>
                  <tr
                    onClick={() => handleInvoiceDetail(inv.id)}
                    style={{ backgroundColor: index % 2 === 0 ? '#e8f5e9' : '#c8e6c9', cursor: 'pointer' }}
                  >
                    <td style={styles.cell}>{inv.id}</td>
                    <td style={styles.cell}>{inv.customer_name}</td>
                    <td style={styles.cell}>${parseFloat(inv.total || 0).toFixed(2)}</td>
                    <td style={styles.cell}>${parseFloat(inv.amount_paid || 0).toFixed(2)}</td>
                  </tr>
                  {detailInvoiceId === inv.id && (
                    <tr key={`${inv.id}-detail`}>
                      <td colSpan="4" style={styles.detailCell}>
                        {isLoadingDetail ? 'Loading...' : <pre style={styles.detailJson}>{JSON.stringify(invoiceDetail, null, 2)}</pre>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {sortedReconciled.length === 0 && (
                <tr><td colSpan="4" style={styles.cell}>No reconciled invoices found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* --- TABLE 2: Unreconciled Invoices --- */}
      <div style={styles.tableWrapper}>
        <div style={styles.tableHeaderSection}>
          <div>
            <h2>Action Required: Unreconciled Invoices</h2>
            <p style={{ fontSize: '14px', color: '#555', margin: '5px 0 15px 0' }}>Click an invoice below to begin.</p>
          </div>
          <button style={styles.toggleBtn} onClick={() => setShowUnreconciled(!showUnreconciled)}>
            {showUnreconciled ? 'Hide Table ⏶' : 'Show Table ⏷'}
          </button>
        </div>

        {showUnreconciled && (
          <table style={styles.table}>
             <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th} onClick={() => handleSort('unreconciled', 'id')}>Invoice ID{getSortIndicator(sortUnreconciled, 'id')}</th>
                {/* Updated to customer_name */}
                <th style={styles.th} onClick={() => handleSort('unreconciled', 'customer_name')}>Customer{getSortIndicator(sortUnreconciled, 'customer_name')}</th>
                <th style={styles.th} onClick={() => handleSort('unreconciled', 'status')}>Status{getSortIndicator(sortUnreconciled, 'status')}</th>
                <th style={styles.th} onClick={() => handleSort('unreconciled', 'total')}>Total{getSortIndicator(sortUnreconciled, 'total')}</th>
                <th style={styles.th} onClick={() => handleSort('unreconciled', 'amount_paid')}>Amount Paid{getSortIndicator(sortUnreconciled, 'amount_paid')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedUnreconciled.map((inv, index) => {
                const isSelected = selectedInvoice?.id === inv.id;
                const liveAmountPaid = parseFloat(inv.amount_paid || 0) + (pendingByInvoice[inv.id] || 0);

                const isFullyCovered = liveAmountPaid >= parseFloat(inv.total || 0);

                return (
                  <React.Fragment key={inv.id}>
                    <tr
                      onClick={() => { handleInvoiceSelect(inv); handleInvoiceDetail(inv.id); }}
                      style={{
                        backgroundColor: isFullyCovered ? '#c8e6c9' : (index % 2 === 0 ? '#ffebee' : '#ffcdd2'),
                        border: isSelected ? '3px solid #d32f2f' : '1px solid transparent',
                        cursor: 'pointer', transition: 'background-color 0.3s ease, border 0.2s ease'
                      }}
                    >
                      <td style={styles.cell}>{isSelected ? <strong>[SEL] </strong> : null}{inv.id}</td>
                      <td style={styles.cell}>{inv.customer_name}</td>
                      <td style={styles.cell}><span style={styles.statusBadge(inv.status)}>{inv.status || 'Pending'}</span></td>
                      <td style={styles.cell}>${parseFloat(inv.total || 0).toFixed(2)}</td>
                      <td style={styles.cell}>${liveAmountPaid.toFixed(2)}</td>
                    </tr>
                    {detailInvoiceId === inv.id && (
                      <tr key={`${inv.id}-detail`}>
                        <td colSpan="5" style={styles.detailCell}>
                          {isLoadingDetail ? 'Loading...' : <pre style={styles.detailJson}>{JSON.stringify(invoiceDetail, null, 2)}</pre>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
               {sortedUnreconciled.length === 0 && (
                <tr><td colSpan="5" style={styles.cell}>No unreconciled invoices found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* --- SWIPER INTERFACE --- */}
      <div style={styles.swiperSection}>
        <h2>Transaction Matcher</h2>
        {!selectedInvoice ? (
          <div style={styles.placeholderBox}>
             <h3>⚠️ Please select an unreconciled invoice above</h3>
             <p>The transaction matcher will appear once an invoice is targeted for reconciliation.</p>
          </div>
        ) : (
          <div style={styles.matcherContent}>
            
            {/* Selected Invoice Banner */}
            <div style={styles.selectedInvoiceBanner}>
              <p style={styles.bannerText}>Currently Matching For:</p>
              <table style={{...styles.table, marginBottom: '20px'}}>
                <tbody>
                  <tr style={{ backgroundColor: '#ffebee', border: '3px solid #d32f2f' }}>
                    <td style={{...styles.cell, textAlign: 'center'}}>
                      <strong>{selectedInvoice.id}</strong> | {selectedInvoice.customer_name} | Total: ${parseFloat(selectedInvoice.total || 0).toFixed(2)} | Paid: ${parseFloat(selectedInvoice.amount_paid || 0).toFixed(2)} | <strong>Difference: ${Math.abs(parseFloat(selectedInvoice.total || 0) - parseFloat(selectedInvoice.amount_paid || 0)).toFixed(2)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={styles.cardStackContainer} key={selectedInvoice.id}>
              {currentIndex === -1 && <div style={styles.emptyCard}><p>No more available transactions.</p></div>}
              {currentStack.map((tx, index) => (
                <TinderCard ref={childRefs[index]} key={tx.id} onSwipe={(dir) => swiped(dir, tx, index)} preventSwipe={['up', 'down']} className="swipe">
                  <div style={styles.tinderCard}>
                    <div style={styles.cardHeader}><h3>Transaction {currentStack.length - index}/{currentStack.length}</h3></div>
                    <div style={styles.jsonWrapper}><pre style={styles.jsonBlock}>{JSON.stringify(tx, null, 2)}</pre></div>
                  </div>
                </TinderCard>
              ))}
            </div>

            <div style={styles.buttonRow}>
              <button style={{...styles.controlBtn, ...styles.btnLeft, opacity: canSwipe ? 1 : 0.5}} onClick={() => swipe('left')} disabled={!canSwipe}>&#10006; Skip</button>
              <button style={{...styles.controlBtn, ...styles.btnUndo, opacity: canGoBack ? 1 : 0.5}} onClick={() => goBack()} disabled={!canGoBack}>&#8634; Undo</button>
              <button style={{...styles.controlBtn, ...styles.btnRight, opacity: canSwipe ? 1 : 0.5}} onClick={() => swipe('right')} disabled={!canSwipe}>&#10004; Match</button>
            </div>
          </div>
        )}
      </div>

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
  container: { fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  loginWrapper: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f0f2f5' },
  loginBox: { backgroundColor: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', width: '320px' },
  loginTitle: { textAlign: 'center', marginBottom: '28px', color: '#333', fontSize: '26px' },
  loginForm: { display: 'flex', flexDirection: 'column', gap: '14px' },
  loginInput: { padding: '12px 14px', fontSize: '15px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none' },
  loginBtn: { padding: '12px', backgroundColor: '#2196f3', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' },
  loginError: { color: '#c62828', fontSize: '13px', textAlign: 'center' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '10px' },
  logoutBtn: { padding: '8px 16px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#555' },
  header: { color: '#333', marginBottom: '0' },
  filterBar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '30px' },
  filterLabel: { fontWeight: 'bold', fontSize: '14px', color: '#555' },
  filterSelect: { padding: '8px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer', minWidth: '200px' },
  summaryBar: { display: 'flex', gap: '30px', marginBottom: '30px', padding: '14px 24px', backgroundColor: '#f5f5f5', borderRadius: '8px', border: '1px solid #ddd' },
  summaryItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  summaryLabel: { fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#888' },
  summaryValue: { fontSize: '18px', fontWeight: 'bold', color: '#333' },
  tableWrapper: { width: '80%', marginBottom: '40px' },
  tableHeaderSection: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  toggleBtn: { padding: '8px 12px', backgroundColor: '#e0e0e0', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' },
  table: { width: '100%', borderCollapse: 'collapse', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
  tableHeader: { backgroundColor: '#444', color: '#fff', userSelect: 'none' },
  th: { padding: '12px 15px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer', borderRight: '1px solid #555' },
  cell: { padding: '12px 15px', borderBottom: '1px solid #ddd', fontSize: '15px' },
  detailCell: { padding: '0', borderBottom: '2px solid #bbb', backgroundColor: '#1e1e1e' },
  detailJson: { margin: 0, padding: '15px', color: '#d4d4d4', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
  statusBadge: (status) => ({ display: 'inline-block', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', backgroundColor: status === 'partially_paid' ? '#fff3cd' : '#f8d7da', color: status === 'partially_paid' ? '#856404' : '#721c24' }),
  swiperSection: { width: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px', padding: '30px 20px', backgroundColor: '#f5f5f5', borderRadius: '10px' },
  placeholderBox: { padding: '40px', border: '2px dashed #bbb', borderRadius: '10px', textAlign: 'center', color: '#555', width: '100%', maxWidth: '500px' },
  matcherContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' },
  selectedInvoiceBanner: { width: '100%', maxWidth: '700px', marginBottom: '10px' },
  bannerText: { margin: '0 0 8px 0', fontWeight: 'bold', color: '#d32f2f', textAlign: 'center', fontSize: '14px', textTransform: 'uppercase' },
  cardStackContainer: { width: '450px', height: '450px', position: 'relative', marginTop: '10px', marginBottom: '20px' },
  tinderCard: { width: '100%', height: '100%', backgroundColor: '#fff', borderRadius: '15px', boxShadow: '0 10px 20px rgba(0,0,0,0.15)', padding: '20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: 'grab', userSelect: 'none' },
  cardHeader: { marginBottom: '10px', textAlign: 'center' },
  jsonWrapper: { flexGrow: 1, overflowY: 'auto', backgroundColor: '#2d2d2d', borderRadius: '8px' },
  jsonBlock: { margin: 0, padding: '15px', color: '#f8f8f2', fontSize: '15px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
  emptyCard: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#e0e0e0', borderRadius: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#666', textAlign: 'center', padding: '20px', boxSizing: 'border-box' },
  buttonRow: { display: 'flex', justifyContent: 'space-between', width: '450px', marginTop: '10px' },
  controlBtn: { padding: '15px 20px', borderRadius: '50px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'transform 0.1s' },
  btnLeft: { backgroundColor: '#fff', border: '2px solid #ff4b4b', color: '#ff4b4b' },
  btnUndo: { backgroundColor: '#fff', border: '2px solid #fbc02d', color: '#fbc02d' },
  btnRight: { backgroundColor: '#fff', border: '2px solid #4caf50', color: '#4caf50' },
  footer: { width: '80%', textAlign: 'center', paddingTop: '20px', borderTop: '2px solid #eee' },
  completeBtn: { padding: '15px 30px', backgroundColor: '#2196f3', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }
};