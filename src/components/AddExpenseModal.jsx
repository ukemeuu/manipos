import React, { useState, useEffect } from 'react';
import { X, Upload, Loader2, Check, Plus, Trash2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadToR2 } from '../lib/r2Storage';
import { syncExpenseToGoogleSheet } from '../lib/googleSheetsSyncService';

const logTransportFeesToLogistics = async (
    expenseId, date, supplier, parentCategory, entryMode, quickAmount, items,
    deliveryFeeIncurred, deliveryFeeAmount, deliveryFeeRider, deliveryFeePaymentMode, description
) => {
    try {
        const isTransportCategory = (cat) => {
            if (!cat) return false;
            const lower = cat.toLowerCase();
            return lower.includes('delivery') || lower.includes('transport') || lower.includes('glovo') || lower.includes('rider');
        };

        const getFeeType = (cat) => {
            if (!cat) return 'bringing_goods';
            const lower = cat.toLowerCase();
            if (lower.includes('incoming') || lower.includes('inbound')) return 'bringing_goods';
            if (lower.includes('outgoing') || lower.includes('outbound')) return 'delivering_orders';
            return 'bringing_goods';
        };

        const logs = [];

        // 1. Process delivery fee from questionnaire if Yes
        if (deliveryFeeIncurred === 'yes') {
            const amount = parseFloat(deliveryFeeAmount) || 0;
            if (amount > 0) {
                logs.push({
                    fee_type: 'bringing_goods',
                    amount,
                    date,
                    supplier_or_partner: deliveryFeeRider || 'Direct Rider',
                    reference_id: `expense_id:${expenseId}:delivery_questionnaire`,
                    is_included_in_bill: deliveryFeePaymentMode === 'included',
                    payment_status: deliveryFeePaymentMode === 'included' ? 'Charged to Bill' : 'Paid Separately',
                    notes: `Inbound delivery fee: ${description || 'General Supplies'}`
                });
            }
        }

        // 2. Process transport fee from categories entered
        if (entryMode === 'quick') {
            const amount = parseFloat(quickAmount) || 0;
            if (isTransportCategory(parentCategory)) {
                // To prevent double logging if it is the same delivery fee
                if (deliveryFeeIncurred !== 'yes') {
                    logs.push({
                        fee_type: getFeeType(parentCategory),
                        amount,
                        date,
                        supplier_or_partner: supplier || 'General Transport',
                        reference_id: `expense_id:${expenseId}`,
                        notes: `Quick expense: ${parentCategory}`
                    });
                }
            }
        } else {
            items.forEach((item, idx) => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                const itemTotal = qty * price;
                const cat = item.category || parentCategory;
                if (isTransportCategory(cat)) {
                    logs.push({
                        fee_type: getFeeType(cat),
                        amount: itemTotal,
                        date,
                        supplier_or_partner: supplier || 'General Transport',
                        reference_id: `expense_id:${expenseId}:${idx}`,
                        notes: `Itemized expense: ${item.item_name || 'Transport'} (${cat})`
                    });
                }
            });
        }

        if (logs.length > 0) {
            const { error } = await supabase
                .from('delivery_fees')
                .insert(logs);
            if (error) throw error;
        }
    } catch (err) {
        console.error('Error logging transport fees to logistics:', err);
    }
};

const GENERAL_CATEGORIES = [
    'Supplies - Food',
    'Supplies - Beverages',
    'Delivery Fees (Incoming)',
    'Delivery Fees (Outgoing)',
    'Transport - Inbound',
    'Transport - Outbound',
    'Staff Transport',
    'Maintenance',
    'Other'
];

const MANAGEMENT_CATEGORIES = [
    'Management - Staff Salary',
    'Management - Rent',
    'Management - Permits',
    'Management - Legal Fees',
    'Management - Accountant Fees',
    'Management - Staff Training',
    'Management - Miscellaneous',
    'Management - Insurance',
    'Management - Utilities',
    'Management - Software & Subscriptions',
    'Management - Bank Transfer Charges',
    'Management - Advertising and Promotions'
];

const EMPTY_ITEM = { item_name: '', quantity: '1', unit: 'pcs', unit_price: '', category: 'Supplies - Food' };
const MAX_ITEMS = 40;

const UNIT_OPTIONS = [
    { value: 'pcs', label: 'Pieces (pcs)' },
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'g', label: 'Grams (g)' },
    { value: 'L', label: 'Liters (L)' },
    { value: 'ml', label: 'Milliliters (ml)' },
    { value: 'box', label: 'Box' },
    { value: 'pack', label: 'Pack' },
    { value: 'tray', label: 'Tray' },
    { value: 'bunch', label: 'Bunch' },
    { value: 'tin', label: 'Tin' },
    { value: 'bag', label: 'Bag' },
    { value: 'crate', label: 'Crate' },
    { value: 'bottle', label: 'Bottle' },
];

export function AddExpenseModal({ onClose, onSuccess, capturedBy = null, initialData = null, initialAmount = null, defaultMode = 'general', isAdmin = false }) {
    let categoriesList = GENERAL_CATEGORIES;
    if (defaultMode === 'management') {
        categoriesList = MANAGEMENT_CATEGORIES;
    } else if (defaultMode === 'personal') {
        categoriesList = ['Director Drawings'];
    } else if (capturedBy) {
        categoriesList = GENERAL_CATEGORIES;
    }

    const [loading, setLoading] = useState(false);
    const [directorName, setDirectorName] = useState(initialData?.director_name || '');
    
    const [formData, setFormData] = useState(() => {
        if (initialData) return initialData;
        
        let defaultCategory = categoriesList[0];
        let defaultExpenseType = 'OPEX';
        
        if (defaultMode === 'personal') {
            defaultCategory = 'Director Drawings';
            defaultExpenseType = 'PERSONAL';
        } else if (defaultMode === 'management') {
            defaultCategory = 'Management - Staff Salary';
            defaultExpenseType = 'OPEX';
        } else {
            defaultCategory = 'Supplies - Food';
            defaultExpenseType = 'COGS';
        }
        
        return {
            date: new Date().toISOString().split('T')[0],
            purchase_date: new Date().toISOString().split('T')[0],
            description: '',
            category: defaultCategory,
            expense_type: defaultExpenseType,
            supplier: '',
            payment_method: 'Cash',
        };
    });

    // Mode toggles
    const [entryMode, setEntryMode] = useState('quick'); // 'quick' or 'itemized'
    const [quickAmount, setQuickAmount] = useState(initialAmount != null ? String(initialAmount) : '');

    const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
    const [file, setFile] = useState(null);
    const [supplierSuggestions, setSupplierSuggestions] = useState([]);

    // VAT states
    const [vatIncluded, setVatIncluded] = useState(''); // 'yes' or 'no'
    // Note: VAT on Kenyan receipts is always inclusive (embedded in the total price)
    const vatCalculationMode = 'inclusive';

    // Delivery fee questionnaire states
    const [deliveryFeeIncurred, setDeliveryFeeIncurred] = useState(''); // 'yes' or 'no'
    const [deliveryFeeAmount, setDeliveryFeeAmount] = useState('');
    const [deliveryFeeRider, setDeliveryFeeRider] = useState('');
    const [deliveryFeePaymentMode, setDeliveryFeePaymentMode] = useState('separate'); // 'separate' or 'included'

    // Reactive VAT details computation
    const calculatedVatDetails = React.useMemo(() => {
        const isTransportCategory = (cat) => {
            if (!cat) return false;
            const lower = cat.toLowerCase();
            return lower.includes('delivery') || lower.includes('transport') || lower.includes('glovo') || lower.includes('rider');
        };

        let taxableBase = 0;
        let transportAmount = 0;

        if (entryMode === 'quick') {
            const amount = parseFloat(quickAmount) || 0;
            if (isTransportCategory(formData.category)) {
                transportAmount = amount;
            } else {
                taxableBase = amount;
            }
        } else {
            items.forEach(item => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                const itemTotal = qty * price;
                const cat = item.category || formData.category;
                if (isTransportCategory(cat)) {
                    transportAmount += itemTotal;
                } else {
                    taxableBase += itemTotal;
                }
            });
        }

        // Deduct delivery fee from VAT taxable base if it is already included in the bill/receipt total
        const deliveryFeeVal = (deliveryFeeIncurred === 'yes') ? (parseFloat(deliveryFeeAmount) || 0) : 0;
        if (deliveryFeeIncurred === 'yes' && deliveryFeePaymentMode === 'included') {
            taxableBase = Math.max(0, taxableBase - deliveryFeeVal);
            transportAmount += deliveryFeeVal;
        }

        let vatAmount = 0;
        let taxableAmount = 0;
        let finalTotal = 0;

        if (vatIncluded === 'yes') {
            if (vatCalculationMode === 'inclusive') {
                vatAmount = taxableBase - (taxableBase / 1.16);
                taxableAmount = taxableBase / 1.16;
                finalTotal = taxableBase + transportAmount;
            } else {
                vatAmount = taxableBase * 0.16;
                taxableAmount = taxableBase;
                finalTotal = taxableBase + vatAmount + transportAmount;
            }
        } else {
            finalTotal = taxableBase + transportAmount;
        }

        return {
            taxableBase,
            transportAmount,
            vatAmount: parseFloat(vatAmount.toFixed(2)),
            taxableAmount: parseFloat(taxableAmount.toFixed(2)),
            finalTotal: parseFloat(finalTotal.toFixed(2))
        };
    }, [entryMode, quickAmount, items, vatIncluded, formData.category, deliveryFeeIncurred, deliveryFeeAmount, deliveryFeePaymentMode]);

    // 1. Restore drafted state on mount (skip if pre-populated via initialData or not in general mode)
    useEffect(() => {
        if (initialData || defaultMode !== 'general') return;
        try {
            const draft = localStorage.getItem('expense_draft');
            if (draft) {
                const parsed = JSON.parse(draft);
                if (parsed.items) setItems(parsed.items);
                if (parsed.formData) setFormData(parsed.formData);
                if (parsed.entryMode) setEntryMode(parsed.entryMode);
                if (parsed.quickAmount) setQuickAmount(parsed.quickAmount);
                if (parsed.vatIncluded) setVatIncluded(parsed.vatIncluded);
                // vatCalculationMode is always 'inclusive' — no need to restore
                if (parsed.deliveryFeeIncurred) setDeliveryFeeIncurred(parsed.deliveryFeeIncurred);
                if (parsed.deliveryFeeAmount) setDeliveryFeeAmount(parsed.deliveryFeeAmount);
                if (parsed.deliveryFeeRider) setDeliveryFeeRider(parsed.deliveryFeeRider);
                if (parsed.deliveryFeePaymentMode) setDeliveryFeePaymentMode(parsed.deliveryFeePaymentMode);
            }
        } catch (e) {
            console.error('Failed to parse draft', e);
        }
    }, []);

    // 2. Persist draft continuously (only for general mode)
    useEffect(() => {
        if (defaultMode !== 'general') return;
        localStorage.setItem('expense_draft', JSON.stringify({
        items, formData, entryMode, quickAmount, vatIncluded,
            deliveryFeeIncurred, deliveryFeeAmount, deliveryFeeRider, deliveryFeePaymentMode
        }));
    }, [items, formData, entryMode, quickAmount, vatIncluded, deliveryFeeIncurred, deliveryFeeAmount, deliveryFeeRider, deliveryFeePaymentMode]);

    // Fetch existing suppliers once for suggestions
    useEffect(() => {
        const fetchSuppliers = async () => {
            try {
                // Get distinct suppliers from existing expenses
                const { data, error } = await supabase
                    .from('expenses')
                    .select('supplier')
                    .not('supplier', 'is', null)
                    .neq('supplier', '');

                if (error) throw error;

                // Extract unique names and sort them
                const unique = Array.from(new Set(data.map(d => d.supplier.trim())))
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));

                setSupplierSuggestions(unique);
            } catch (err) {
                console.error('Error fetching suppliers:', err);
            }
        };

        fetchSuppliers();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'category' && defaultMode === 'general') {
            const cogsCategories = [
                'Supplies - Food', 
                'Supplies - Beverages', 
                'Delivery Fees (Incoming)', 
                'Transport - Inbound'
            ];
            const autoType = cogsCategories.includes(value) ? 'COGS' : 'OPEX';
            setFormData(prev => ({
                ...prev,
                category: value,
                expense_type: autoType
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleFileChange = (e) => {
        e.stopPropagation();
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    // --- Item management ---
    const updateItem = (index, field, value) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const addItem = () => {
        if (items.length < MAX_ITEMS) {
            setItems([...items, { ...EMPTY_ITEM }]);
        }
    };

    const removeItem = (index) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const getItemTotal = (item) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        return qty * price;
    };

    const grandTotal = items.reduce((sum, item) => sum + getItemTotal(item), 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (defaultMode === 'personal' && !directorName) {
            alert('Please select a director.');
            setLoading(false);
            return;
        }

        // Force VAT question to be answered (exclude Personal mode and non-admins)
        if (isAdmin && defaultMode !== 'personal' && vatIncluded === '') {
            alert('Please specify if this invoice/receipt is vatted.');
            setLoading(false);
            return;
        }

        // Force Delivery Fee question to be answered (exclude Personal mode)
        if (defaultMode !== 'personal' && deliveryFeeIncurred === '') {
            alert('Please specify if a delivery fee was incurred in bringing in these supplies.');
            setLoading(false);
            return;
        }

        if (defaultMode !== 'personal' && deliveryFeeIncurred === 'yes') {
            if (!deliveryFeeAmount || parseFloat(deliveryFeeAmount) <= 0) {
                alert('Please enter a valid delivery fee amount.');
                setLoading(false);
                return;
            }
            if (!deliveryFeeRider.trim()) {
                alert('Please specify the delivery rider or partner name.');
                setLoading(false);
                return;
            }
        }

        // Validation based on mode
        let finalGrandTotal = calculatedVatDetails.finalTotal;
        let validItemRows = [];

        if (entryMode === 'quick') {
            const amount = parseFloat(quickAmount);
            if (!amount || amount <= 0) {
                alert('Please enter a valid amount.');
                setLoading(false);
                return;
            }
            // Create a generic fallback item for the DB matching final calculated total
            validItemRows = [{
                item_name: defaultMode === 'personal' ? 'Director Drawings' : 'General Items',
                quantity: 1,
                unit: 'items',
                unit_price: finalGrandTotal
            }];
        } else {
            const validItems = items.filter(item => item.item_name.trim() && item.unit_price);
            if (validItems.length === 0) {
                alert('Please add at least one item with a name and price.');
                setLoading(false);
                return;
            }

            validItemRows = validItems.map(item => ({
                item_name: item.item_name.trim(),
                quantity: parseFloat(item.quantity) || 1,
                unit: item.unit,
                unit_price: parseFloat(item.unit_price) || 0,
                category: item.category || formData.category
            }));
        }

        try {
            let receipt_url = null;

            // 1. Upload File if exists
            if (file) {
                const { url } = await uploadToR2(file, 'receipts');
                receipt_url = url;
            }

            // 2. Insert parent expense with VAT columns
            const isVatted = isAdmin && defaultMode !== 'personal' && vatIncluded === 'yes';
            const { data: expenseData, error: insertError } = await supabase
                .from('expenses')
                .insert([{
                    date: formData.date,
                    purchase_date: formData.purchase_date,
                    description: entryMode === 'quick' 
                        ? (defaultMode === 'personal' ? `Director Drawings: ${directorName}` : formData.description) 
                        : `Multiple items (${validItemRows.length})`,
                    amount: finalGrandTotal,
                    quantity: entryMode === 'itemized' ? validItemRows.length : 1,
                    unit: 'items',
                    receipt_url,
                    captured_by: capturedBy,
                    category: defaultMode === 'personal' ? 'Director Drawings' : formData.category,
                    expense_type: defaultMode === 'personal' ? 'PERSONAL' : formData.expense_type,
                    supplier: formData.supplier,
                    payment_method: formData.payment_method,
                    director_name: defaultMode === 'personal' ? directorName : null,
                    vat_included: isVatted,
                    vat_exclusive: isVatted && vatCalculationMode === 'exclusive',
                    vat_amount: isVatted ? calculatedVatDetails.vatAmount : 0,
                    taxable_amount: isVatted ? calculatedVatDetails.taxableAmount : finalGrandTotal
                }])
                .select()
                .single();

            if (insertError) throw insertError;

            // Auto-sync expense to Google Spreadsheet 1j8S_8MH_CnVD00CmH-zVOOb5mkgQePrxJio_CCz9M9s
            syncExpenseToGoogleSheet(expenseData);

            // 3. Insert line items
            const finalItemRows = validItemRows.map(item => ({
                ...item,
                expense_id: expenseData.id
            }));

            const { error: itemsError } = await supabase
                .from('expense_items')
                .insert(finalItemRows);

            if (itemsError) throw itemsError;

            // 4. Log transport fees to logistics database if applicable
            await logTransportFeesToLogistics(
                expenseData.id,
                formData.date,
                formData.supplier,
                formData.category,
                entryMode,
                quickAmount,
                validItemRows,
                deliveryFeeIncurred,
                deliveryFeeAmount,
                deliveryFeeRider,
                deliveryFeePaymentMode,
                formData.description
            );

            // Clear draft after successful submission
            localStorage.removeItem('expense_draft');
            onSuccess();
        } catch (error) {
            console.error('Error adding expense:', error);
            alert('Error adding expense: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
                    <h2 className="text-xl font-bold text-gray-900">
                        {defaultMode === 'personal' ? 'Add Personal Expense (Director Drawings)' :
                         defaultMode === 'management' ? 'Add Management Expense' : 'Add Store Expense'}
                    </h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {/* Top fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                            <input
                                type="date"
                                name="purchase_date"
                                required
                                value={formData.purchase_date}
                                onChange={handleChange}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>
                        {defaultMode === 'personal' ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Director</label>
                                <select
                                    required
                                    value={directorName}
                                    onChange={(e) => setDirectorName(e.target.value)}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold text-gray-800"
                                >
                                    <option value="">Select Director...</option>
                                    <option value="Shalyn Ndunge Achieng">Shalyn Ndunge Achieng</option>
                                    <option value="Ukeme Michael Udofia">Ukeme Michael Udofia</option>
                                </select>
                            </div>
                        ) : defaultMode === 'management' ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Expense Type</label>
                                <input
                                    type="text"
                                    disabled
                                    value="OPEX (Operating Expense)"
                                    className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 font-bold"
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Expense Type</label>
                                <select
                                    name="expense_type"
                                    value={formData.expense_type}
                                    onChange={handleChange}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                >
                                    <option value="OPEX">OPEX (Operating Expense)</option>
                                    <option value="COGS">COGS (Cost of Goods Sold)</option>
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (Optional)</label>
                            <input
                                type="text"
                                name="supplier"
                                list="supplier-list"
                                value={formData.supplier}
                                onChange={handleChange}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                placeholder="Select or type supplier..."
                            />
                            <datalist id="supplier-list">
                                {supplierSuggestions.map((s, i) => (
                                    <option key={i} value={s} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input
                            type="text"
                            name="description"
                            required
                            value={formData.description}
                            onChange={handleChange}
                            className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            placeholder="e.g. Weekly vegetable stock"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            {defaultMode === 'personal' ? (
                                <input
                                    type="text"
                                    disabled
                                    value="Director Drawings"
                                    className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 font-bold"
                                />
                            ) : (
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleChange}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                >
                                    {categoriesList.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                            <select
                                name="payment_method"
                                value={formData.payment_method}
                                onChange={handleChange}
                                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            >
                                <option>Cash</option>
                                <option>M-Pesa</option>
                                <option>Bank Transfer</option>
                                <option>Cheque</option>
                                <option>Credit</option>
                            </select>
                        </div>
                    </div>

                    {/* Entry Mode Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-xl w-full">
                        <button
                            type="button"
                            onClick={() => setEntryMode('quick')}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${entryMode === 'quick' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Quick Amount
                        </button>
                        <button
                            type="button"
                            onClick={() => setEntryMode('itemized')}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${entryMode === 'itemized' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Add Line Items
                        </button>
                    </div>

                    {/* Conditional Entry Fields */}
                    {entryMode === 'quick' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (KES)</label>
                            <input
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                value={quickAmount}
                                onChange={(e) => setQuickAmount(e.target.value)}
                                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary text-xl font-bold bg-gray-50 text-gray-900"
                                placeholder="e.g. 5000"
                            />
                        </div>
                    ) : (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <Package size={16} className="text-gray-500" />
                                    <span className="text-sm font-bold text-gray-700">Items</span>
                                    <span className="text-[10px] font-bold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                                        {items.length} / {MAX_ITEMS}
                                    </span>
                                </div>
                                {items.length < MAX_ITEMS && (
                                    <button
                                        type="button"
                                        onClick={addItem}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors"
                                    >
                                        <Plus size={12} /> Add Item
                                    </button>
                                )}
                            </div>

                            {/* Column headers */}
                            <div className="grid grid-cols-[1.5fr_1fr_70px_80px_90px_32px] gap-2 px-4 py-2 bg-gray-50/50 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100">
                                <span>Item Name</span>
                                <span>Category</span>
                                <span>Qty</span>
                                <span>Unit</span>
                                <span>Price (KES)</span>
                                <span></span>
                            </div>

                            <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {items.map((item, index) => (
                                    <div
                                        key={index}
                                        className="grid grid-cols-[1.5fr_1fr_70px_80px_90px_32px] gap-2 px-4 py-2 items-center hover:bg-gray-50/50 transition-colors"
                                    >
                                        <input
                                            type="text"
                                            value={item.item_name}
                                            onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                                            placeholder="e.g. Tomatoes"
                                            className="w-full p-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary/20 focus:border-primary"
                                        />
                                        <select
                                            value={item.category || categoriesList[0]}
                                            onChange={(e) => updateItem(index, 'category', e.target.value)}
                                            className="w-full p-1.5 text-[10px] border border-gray-200 rounded-md focus:ring-1 focus:ring-primary/20 focus:border-primary"
                                        >
                                            {categoriesList.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                            min="0"
                                            step="0.01"
                                            className="w-full p-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary/20 focus:border-primary text-center"
                                        />
                                        <select
                                            value={item.unit}
                                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                            className="w-full p-1.5 text-xs border border-gray-200 rounded-md focus:ring-1 focus:ring-primary/20 focus:border-primary"
                                        >
                                            {UNIT_OPTIONS.map(u => (
                                                <option key={u.value} value={u.value}>{u.value}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            value={item.unit_price}
                                            onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                                            min="0"
                                            step="0.01"
                                            placeholder="0"
                                            className="w-full p-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary/20 focus:border-primary font-bold text-right"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            disabled={items.length <= 1}
                                            className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Total */}
                            {entryMode === 'itemized' && (
                                <div className="bg-gray-900 px-4 py-3 flex justify-between items-center rounded-b-xl border-t border-gray-800">
                                    <span className="text-white text-xs font-bold uppercase tracking-wider">Total Amount</span>
                                    <span className="font-mono font-black text-white text-lg">
                                        KES {grandTotal.toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* VAT Questionnaire */}
                    {isAdmin && defaultMode !== 'personal' && (
                        <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-800">Is this invoice/receipt vatted? *</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="vat_included_radio" 
                                            value="yes"
                                            checked={vatIncluded === 'yes'}
                                            onChange={() => {
                                                setVatIncluded('yes');
                                                if (!vatCalculationMode) setVatCalculationMode('inclusive');
                                            }}
                                            className="text-primary focus:ring-primary h-4 w-4"
                                        />
                                        Yes
                                    </label>
                                    <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="vat_included_radio" 
                                            value="no"
                                            checked={vatIncluded === 'no'}
                                            onChange={() => {
                                                setVatIncluded('no');
                                                setVatCalculationMode('inclusive');
                                            }}
                                            className="text-primary focus:ring-primary h-4 w-4"
                                        />
                                        No
                                    </label>
                                </div>
                            </div>

                            {vatIncluded === 'yes' && (
                                <div className="space-y-3 p-3 bg-white rounded-lg border border-blue-50 animate-in fade-in duration-200">
                                    <p className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">VAT is extracted from the receipt total (inclusive @ 16%)</p>

                                    {/* VAT Breakdown Display */}
                                    <div className="border-t border-gray-100 pt-2 flex flex-col gap-1 text-xs font-medium text-gray-500">
                                        <div className="flex justify-between">
                                            <span>Subtotal (excluding Transport):</span>
                                            <span className="font-mono font-bold text-gray-700">
                                                KES {calculatedVatDetails.taxableBase.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-blue-600 font-bold bg-blue-50/40 p-1.5 rounded">
                                            <span>Calculated Input Tax (VAT 16%):</span>
                                            <span className="font-mono">
                                                KES {calculatedVatDetails.vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-gray-800 font-bold">
                                            <span>Total Base Taxable (Exclusive):</span>
                                            <span className="font-mono">
                                                KES {calculatedVatDetails.taxableAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </span>
                                        </div>
                                        {calculatedVatDetails.transportAmount > 0 && (
                                            <div className="flex justify-between text-orange-600 font-semibold text-[10px]">
                                                <span>Excluded Transport Amount:</span>
                                                <span className="font-mono">
                                                    KES {calculatedVatDetails.transportAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-gray-100 pt-1.5 font-bold text-gray-900">
                                            <span>Final Recorded Total (Inclusive):</span>
                                            <span className="font-mono">
                                                KES {calculatedVatDetails.finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Delivery Fee Questionnaire */}
                    {defaultMode !== 'personal' && (
                        <div className="bg-orange-50/40 border border-orange-150 p-4 rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-800">Was a delivery fee incurred in bringing in these supplies? *</span>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="delivery_fee_incurred_radio" 
                                            value="yes"
                                            checked={deliveryFeeIncurred === 'yes'}
                                            onChange={() => {
                                                setDeliveryFeeIncurred('yes');
                                            }}
                                            className="text-primary focus:ring-primary h-4 w-4"
                                        />
                                        Yes
                                    </label>
                                    <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="delivery_fee_incurred_radio" 
                                            value="no"
                                            checked={deliveryFeeIncurred === 'no'}
                                            onChange={() => {
                                                setDeliveryFeeIncurred('no');
                                                setDeliveryFeeAmount('');
                                                setDeliveryFeeRider('');
                                            }}
                                            className="text-primary focus:ring-primary h-4 w-4"
                                        />
                                        No
                                    </label>
                                </div>
                            </div>

                            {deliveryFeeIncurred === 'yes' && (
                                <div className="space-y-3 p-3 bg-white rounded-lg border border-orange-100/50 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Delivery Fee Amount (KES) *</label>
                                            <input 
                                                type="number" 
                                                required 
                                                min="0.01" 
                                                step="0.01" 
                                                placeholder="e.g. 350"
                                                value={deliveryFeeAmount} 
                                                onChange={(e) => setDeliveryFeeAmount(e.target.value)}
                                                className="w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary font-mono font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Rider / Partner Name *</label>
                                            <input 
                                                type="text" 
                                                required 
                                                placeholder="e.g. Funmilayo, Glovo"
                                                value={deliveryFeeRider} 
                                                onChange={(e) => setDeliveryFeeRider(e.target.value)}
                                                className="w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary font-semibold"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5 border-t border-gray-150 pt-2.5">
                                        <span className="text-[10px] font-bold text-gray-500">How was the delivery fee paid? *</span>
                                        <div className="flex gap-4 mt-1">
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="delivery_fee_pay_mode" 
                                                    value="included"
                                                    checked={deliveryFeePaymentMode === 'included'}
                                                    onChange={() => setDeliveryFeePaymentMode('included')}
                                                    className="text-primary focus:ring-primary h-3.5 w-3.5"
                                                />
                                                Included in receipt/bill total
                                            </label>
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="delivery_fee_pay_mode" 
                                                    value="separate"
                                                    checked={deliveryFeePaymentMode === 'separate'}
                                                    onChange={() => setDeliveryFeePaymentMode('separate')}
                                                    className="text-primary focus:ring-primary h-3.5 w-3.5"
                                                />
                                                Paid separately to the rider
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Receipt Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Receipt (Optional)</label>
                        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                            <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center gap-2 text-gray-500">
                                {file ? (
                                    <>
                                        <Check className="text-green-500" size={24} />
                                        <span className="text-sm font-medium text-gray-900">{file.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={24} />
                                        <span className="text-sm">Click to upload image or PDF</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Submit */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 size={20} className="animate-spin" /> :
                                `Save Expense — KES ${calculatedVatDetails.finalTotal.toLocaleString()}`
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
