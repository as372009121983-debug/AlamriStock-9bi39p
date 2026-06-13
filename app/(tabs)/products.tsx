// Powered by OnSpace.AI
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '@/hooks/useStore';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/template';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { Header } from '@/components/ui/Header';
import { SearchBar } from '@/components/ui/SearchBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/constants/theme';
import { Product, ProductPrice } from '@/constants/types';
import { formatCurrency, formatNumber, generateId } from '@/services/format';
import { uploadImages } from '@/services/imageUpload';

const UNITS = ['قطعة', 'كرتون', 'متر', 'كجم', 'لتر', 'علبة'];

type FormState = {
  name: string;
  barcode: string;
  category: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  quantity: string;
  lowStockAlert: string;
  warehouseId: string;
  prices: ProductPrice[];
  images: string[];
  notes: string;
};

const emptyForm: FormState = {
  name: '', barcode: '', category: '', unit: 'قطعة',
  purchasePrice: '', salePrice: '', quantity: '',
  lowStockAlert: '5', warehouseId: '',
  prices: [], images: [], notes: '',
};

type SortField = 'name' | 'qty' | 'price';

export default function ProductsScreen() {
  const {
    products, warehouses, addProduct, updateProduct, deleteProduct,
    settings, defaultMainWarehouseId, updateProductQuantity, getStock,
  } = useStore();
  const { canEdit, user } = useAuth();
  const { showAlert } = useAlert();
  const { guard } = useAdminGuard();
  const params = useLocalSearchParams<{ new?: string }>();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');
  const [modalVisible, setModalVisible] = useState(false);
  const [unitPickerVisible, setUnitPickerVisible] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const mainWarehouses = warehouses.filter((w) => w.type === 'main');

  useEffect(() => {
    if (params.new === '1' && !modalVisible && canEdit) openCreate();
  }, [params.new, modalVisible, canEdit]);

  // Derive categories from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.category) cats.add(p.category); });
    return ['الكل', ...Array.from(cats).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'الكل') {
      list = list.filter((p) => p.category === categoryFilter);
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'ar');
      else if (sortBy === 'qty') cmp = a.quantity - b.quantity;
      else if (sortBy === 'price') cmp = a.salePrice - b.salePrice;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [products, search, sortBy, sortAsc, categoryFilter]);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.quantity <= p.lowStockAlert && p.lowStockAlert > 0).length,
    [products]
  );

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortAsc(!sortAsc);
    else { setSortBy(field); setSortAsc(true); }
  }

  function openCreate() {
    if (mainWarehouses.length === 0) {
      showAlert('تنبيه', 'يجب إضافة مخزن رئيسي أولاً قبل إضافة منتجات');
      return;
    }
    setEditing(null);
    setEditingId(null);
    setForm({ ...emptyForm, warehouseId: defaultMainWarehouseId || mainWarehouses[0].id });
    setErrors({});
    setShowPrices(false);
    setShowBarcode(false);
    setShowDetails(false);
    setModalVisible(true);
  }

  function doOpenEdit(product: Product) {
    // Capture id separately to avoid stale closure issues
    setEditing({ ...product });
    setEditingId(product.id);
    setForm({
      name: product.name,
      barcode: product.barcode || '',
      category: product.category || '',
      unit: product.unit || 'قطعة',
      purchasePrice: String(product.purchasePrice),
      salePrice: String(product.salePrice),
      quantity: String(product.quantity),
      lowStockAlert: String(product.lowStockAlert),
      warehouseId: defaultMainWarehouseId || '',
      prices: (product.prices || []).map((p) => ({ ...p })),
      images: [...(product.images || [])],
      notes: product.notes || '',
    });
    setErrors({});
    setShowPrices((product.prices || []).length > 0);
    setShowBarcode(!!product.barcode);
    setShowDetails(!!(product.category || product.notes || (product.images || []).length));
    setModalVisible(true);
  }

  function openEdit(product: Product) {
    guard({
      title: 'تعديل منتج',
      description: `أدخل كلمة مرور المدير لتعديل "${product.name}"`,
      action: () => doOpenEdit(product),
    });
  }

  async function pickImage() {
    if (Platform.OS === 'web') {
      // Web: use file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const uri = e.target?.result as string;
          if (uri) setForm((p) => ({ ...p, images: [...p.images, uri] }));
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showAlert('تنبيه', 'يجب السماح بالوصول للصور');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6,
      });
      if (!res.canceled && res.assets[0]) {
        setForm((p) => ({ ...p, images: [...p.images, res.assets[0].uri] }));
      }
    } catch {
      showAlert('خطأ', 'تعذر اختيار الصورة');
    }
  }

  function addCustomPrice() {
    setForm((p) => ({
      ...p,
      prices: [...p.prices, { id: generateId(), label: 'جملة', price: 0 }],
    }));
  }

  function updateCustomPrice(idx: number, patch: Partial<ProductPrice>) {
    setForm((p) => ({
      ...p,
      prices: p.prices.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    }));
  }

  function removeCustomPrice(idx: number) {
    setForm((p) => ({ ...p, prices: p.prices.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'اسم المنتج مطلوب';
    if (form.salePrice && isNaN(Number(form.salePrice))) next.salePrice = 'سعر بيع غير صحيح';
    if (form.purchasePrice && isNaN(Number(form.purchasePrice))) next.purchasePrice = 'سعر شراء غير صحيح';
    if (form.quantity && isNaN(Number(form.quantity))) next.quantity = 'كمية غير صحيحة';
    setErrors(next);
    if (Object.keys(next).length) return;

    let finalImages = form.images;
    if (user?.id && form.images.some((u) => !/^https?:\/\//i.test(u) && !u.startsWith('data:'))) {
      setUploading(true);
      const result = await uploadImages(form.images, user.id, 'products');
      setUploading(false);
      if (result.failed > 0) {
        showAlert('تنبيه', `فشل رفع ${result.failed} صورة`);
      }
      finalImages = result.urls;
    }

    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      category: form.category.trim(),
      unit: form.unit.trim() || 'قطعة',
      purchasePrice: Number(form.purchasePrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      lowStockAlert: Number(form.lowStockAlert) || 0,
      prices: form.prices.filter((p) => p.label.trim()),
      images: finalImages,
      notes: form.notes.trim(),
    };

    // Use captured editingId (not from editing object) to prevent stale closure bugs
    const currentEditingId = editingId;

    if (currentEditingId) {
      // Only update non-quantity fields — quantity handled separately
      updateProduct(currentEditingId, payload);
      const newQty = Number(form.quantity) || 0;
      // Get the current product freshly from the list
      const currentProduct = products.find((p) => p.id === currentEditingId);
      const oldQty = currentProduct?.quantity || 0;
      if (newQty !== oldQty && defaultMainWarehouseId) {
        const currentMainStock = getStock(currentEditingId, defaultMainWarehouseId);
        const delta = newQty - oldQty;
        const newMainStock = Math.max(0, currentMainStock + delta);
        const result = updateProductQuantity(currentEditingId, defaultMainWarehouseId, newMainStock);
        if (!result.ok) {
          showAlert('تنبيه', result.message || 'تعذر تعديل الكمية');
        }
      }
      setModalVisible(false);
    } else {
      const res = addProduct(payload, form.warehouseId, Number(form.quantity) || 0);
      if (!res.ok) { showAlert('خطأ', res.message || ''); return; }
      setModalVisible(false);
    }
  }

  function confirmDelete(product: Product) {
    guard({
      title: 'حذف منتج',
      description: `أدخل كلمة مرور المدير لحذف "${product.name}"`,
      action: () => deleteProduct(product.id),
    });
  }

  function renderListItem({ item }: { item: Product }) {
    const low = item.quantity <= item.lowStockAlert && item.lowStockAlert > 0;
    return (
      <Pressable
        onPress={() => canEdit && openEdit(item)}
        style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: Colors.surfaceAlt }]}
      >
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={styles.listImg} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.listImgPlaceholder}>
            <MaterialCommunityIcons name="cube-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.listMid}>
          <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.listTags}>
            {item.category ? (
              <View style={styles.catTag}>
                <Text style={styles.catTagText}>{item.category}</Text>
              </View>
            ) : null}
            {item.unit ? (
              <View style={[styles.catTag, { backgroundColor: Colors.primarySoft }]}>
                <Text style={[styles.catTagText, { color: Colors.primaryDark }]}>{item.unit}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.listRight}>
          <Text style={styles.listPrice}>{formatCurrency(item.salePrice, settings.currency)}</Text>
          <View style={[styles.qtyBadge, low && styles.qtyBadgeLow]}>
            <MaterialCommunityIcons
              name={low ? 'alert' : 'package-variant'}
              size={11}
              color={low ? Colors.danger : Colors.primaryDark}
            />
            <Text style={[styles.qtyBadgeText, low && { color: Colors.danger }]}>
              {formatNumber(item.quantity)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  function renderGridItem({ item }: { item: Product }) {
    const low = item.quantity <= item.lowStockAlert && item.lowStockAlert > 0;
    return (
      <Pressable
        onPress={() => canEdit && openEdit(item)}
        style={({ pressed }) => [styles.gridCard, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
      >
        {item.images?.[0] ? (
          <Image source={{ uri: item.images[0] }} style={styles.gridImg} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.gridImgPlaceholder}>
            <MaterialCommunityIcons name="cube-outline" size={32} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.gridContent}>
          <Text style={styles.gridName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.gridPrice}>{formatCurrency(item.salePrice, settings.currency)}</Text>
          <View style={[styles.gridQty, low && styles.gridQtyLow]}>
            <Text style={[styles.gridQtyText, low && { color: Colors.danger }]}>
              {low ? '⚠ ' : ''}{formatNumber(item.quantity)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.pageTitle}>المنتجات</Text>
          <Text style={styles.pageSub}>{formatNumber(products.length)} منتج</Text>
        </View>
        <View style={styles.headerActions}>
          {lowStockCount > 0 ? (
            <View style={styles.lowStockBadge}>
              <MaterialCommunityIcons name="alert" size={12} color={Colors.danger} />
              <Text style={styles.lowStockText}>{lowStockCount} قارب النفاد</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={viewMode === 'list' ? 'view-grid-outline' : 'view-list'}
              size={22}
              color={Colors.primaryDark}
            />
          </Pressable>
        </View>
      </View>

      {/* Search + Sort */}
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="ابحث بالاسم أو الباركود..." />
        <View style={styles.sortRow}>
          <SortChip label="الاسم" active={sortBy === 'name'} asc={sortAsc} onPress={() => toggleSort('name')} />
          <SortChip label="الكمية" active={sortBy === 'qty'} asc={sortAsc} onPress={() => toggleSort('qty')} />
          <SortChip label="السعر" active={sortBy === 'price'} asc={sortAsc} onPress={() => toggleSort('price')} />
        </View>
      </View>

      {/* Category filter */}
      {categories.length > 2 ? (
        <View style={styles.catBarOuter}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catBarInner}
          >
            {categories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setCategoryFilter(cat)}
                style={({ pressed }) => [
                  styles.catChip,
                  categoryFilter === cat && styles.catChipActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[styles.catChipText, categoryFilter === cat && styles.catChipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {viewMode === 'list' ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="cube-scan"
              title={search ? 'لا توجد نتائج' : 'لا توجد منتجات'}
              description={search ? 'جرب كلمة بحث أخرى' : 'اضغط + لإضافة أول منتج'}
            />
          }
          renderItem={renderListItem}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridList}
          ListEmptyComponent={
            <EmptyState
              icon="cube-scan"
              title={search ? 'لا توجد نتائج' : 'لا توجد منتجات'}
              description={search ? 'جرب كلمة بحث أخرى' : 'اضغط + لإضافة أول منتج'}
            />
          }
          renderItem={renderGridItem}
        />
      )}

      {canEdit ? (
        <>
          <Pressable
            onPress={() => setMenuVisible(true)}
            style={({ pressed }) => [styles.fabSmall, pressed && { opacity: 0.85 }]}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={24} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
          >
            <MaterialCommunityIcons name="plus" size={28} color={Colors.white} />
          </Pressable>
        </>
      ) : null}

      {/* Options menu */}
      <Modal visible={menuVisible} onClose={() => setMenuVisible(false)} title="خيارات المنتجات">
        <Pressable onPress={() => { setMenuVisible(false); openCreate(); }} style={styles.menuRow}>
          <MaterialCommunityIcons name="plus-box-outline" size={20} color={Colors.primary} />
          <Text style={styles.menuLabel}>إضافة منتج جديد</Text>
        </Pressable>
      </Modal>

      {/* Add/Edit modal */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingId ? 'تعديل منتج' : 'إضافة منتج جديد'}
        footer={
          <View style={{ gap: Spacing.sm }}>
            {editingId ? (
              <Button
                title="حذف المنتج"
                icon="trash-can-outline"
                variant="danger"
                onPress={() => {
                  setModalVisible(false);
                  const target = products.find((p) => p.id === editingId);
                  if (target) setTimeout(() => confirmDelete(target), 150);
                }}
                fullWidth
                size="lg"
              />
            ) : null}
            <Button
              title={uploading ? 'جاري الرفع...' : 'حفظ'}
              onPress={handleSubmit}
              loading={uploading}
              fullWidth
              size="lg"
            />
          </View>
        }
      >
        <Input
          label="اسم المنتج"
          value={form.name}
          onChangeText={(t) => setForm((p) => ({ ...p, name: t }))}
          placeholder="اسم المنتج"
          error={errors.name}
        />

        <View>
          <Text style={styles.fieldLabel}>
            الكمية{editingId ? ' (تعديل يؤثر على المخزن الرئيسي)' : ''}
          </Text>
          <View style={styles.qtyRow}>
            <Pressable onPress={() => setUnitPickerVisible(true)} style={styles.unitChip}>
              <Text style={styles.unitText}>{form.unit}</Text>
            </Pressable>
            <View style={styles.qtyDivider} />
            <Input
              containerStyle={{ flex: 1 }}
              style={{ borderWidth: 0, paddingHorizontal: Spacing.md }}
              value={form.quantity}
              onChangeText={(t) => setForm((p) => ({ ...p, quantity: t }))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              error={errors.quantity}
            />
          </View>
        </View>

        <View style={styles.priceRow}>
          <Input
            containerStyle={{ flex: 1 }}
            label="سعر البيع"
            value={form.salePrice}
            onChangeText={(t) => setForm((p) => ({ ...p, salePrice: t }))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={errors.salePrice}
          />
          <Input
            containerStyle={{ flex: 1 }}
            label="سعر الشراء"
            value={form.purchasePrice}
            onChangeText={(t) => setForm((p) => ({ ...p, purchasePrice: t }))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            error={errors.purchasePrice}
          />
        </View>

        {!showPrices ? (
          <Pressable onPress={() => { setShowPrices(true); addCustomPrice(); }} style={styles.addLink}>
            <MaterialCommunityIcons name="plus" size={16} color={Colors.primary} />
            <Text style={styles.addLinkText}>إضافة أسعار بيع أخرى</Text>
          </Pressable>
        ) : (
          <View style={styles.expanded}>
            <Text style={styles.fieldLabel}>أسعار بيع إضافية</Text>
            {form.prices.map((p, idx) => (
              <View key={p.id} style={styles.customPriceRow}>
                <Pressable onPress={() => removeCustomPrice(idx)} hitSlop={6} style={styles.actBtnSmall}>
                  <MaterialCommunityIcons name="close" size={16} color={Colors.danger} />
                </Pressable>
                <Input
                  containerStyle={{ flex: 1 }}
                  value={String(p.price)}
                  onChangeText={(t) => updateCustomPrice(idx, { price: Number(t) || 0 })}
                  keyboardType="decimal-pad"
                  placeholder="السعر"
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  value={p.label}
                  onChangeText={(t) => updateCustomPrice(idx, { label: t })}
                  placeholder="جملة"
                />
              </View>
            ))}
            <Pressable onPress={addCustomPrice} style={styles.addLink}>
              <MaterialCommunityIcons name="plus" size={14} color={Colors.primary} />
              <Text style={styles.addLinkText}>إضافة سعر آخر</Text>
            </Pressable>
          </View>
        )}

        {!showBarcode ? (
          <Pressable onPress={() => setShowBarcode(true)} style={styles.addLink}>
            <MaterialCommunityIcons name="plus" size={16} color={Colors.primary} />
            <Text style={styles.addLinkText}>إضافة باركود</Text>
          </Pressable>
        ) : (
          <Input
            label="الباركود"
            value={form.barcode}
            onChangeText={(t) => setForm((p) => ({ ...p, barcode: t }))}
            placeholder="الباركود"
          />
        )}

        {!showDetails ? (
          <Pressable onPress={() => setShowDetails(true)} style={styles.addLink}>
            <MaterialCommunityIcons name="plus" size={16} color={Colors.primary} />
            <Text style={styles.addLinkText}>تفاصيل إضافية (فئة، ملاحظات، صور)</Text>
          </Pressable>
        ) : (
          <View style={styles.expanded}>
            <Input
              label="الفئة"
              value={form.category}
              onChangeText={(t) => setForm((p) => ({ ...p, category: t }))}
              placeholder="مثل: خلاطات"
            />
            <Input
              label="حد التنبيه للمخزون"
              value={form.lowStockAlert}
              onChangeText={(t) => setForm((p) => ({ ...p, lowStockAlert: t }))}
              placeholder="5"
              keyboardType="number-pad"
            />
            <Input
              label="ملاحظات"
              value={form.notes}
              onChangeText={(t) => setForm((p) => ({ ...p, notes: t }))}
              placeholder="ملاحظات"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <View style={styles.imagesHeader}>
              <Button title="إضافة صورة" icon="image-plus" variant="secondary" size="sm" onPress={pickImage} />
              <Text style={styles.fieldLabel}>صور المنتج ({form.images.length})</Text>
            </View>
            {form.images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {form.images.map((uri, idx) => (
                  <View key={idx} style={styles.imgWrap}>
                    <Image
                      source={uri.startsWith('data:') ? { uri } : uri.startsWith('http') ? { uri } : require('@/assets/empty-state.png')}
                      style={styles.img}
                      contentFit="cover"
                      transition={200}
                    />
                    <Pressable
                      onPress={() => setForm((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                      style={styles.imgRemove}
                    >
                      <MaterialCommunityIcons name="close" size={14} color={Colors.white} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        )}
      </Modal>

      {/* Unit picker */}
      <Modal visible={unitPickerVisible} onClose={() => setUnitPickerVisible(false)} title="اختر الوحدة">
        {UNITS.map((u) => (
          <Pressable
            key={u}
            onPress={() => { setForm((p) => ({ ...p, unit: u })); setUnitPickerVisible(false); }}
            style={styles.menuRow}
          >
            <MaterialCommunityIcons
              name={form.unit === u ? 'check-circle' : 'circle-outline'}
              size={20}
              color={form.unit === u ? Colors.primary : Colors.textMuted}
            />
            <Text style={styles.menuLabel}>{u}</Text>
          </Pressable>
        ))}
      </Modal>
    </SafeAreaView>
  );
}

function SortChip({ label, active, asc, onPress }: { label: string; active: boolean; asc: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.sortChip, active && styles.sortChipActive]}>
      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
      {active ? (
        <MaterialCommunityIcons name={asc ? 'arrow-up' : 'arrow-down'} size={12} color={Colors.white} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Header
  headerBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pageTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  pageSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  lowStockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.dangerSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger },
  lowStockText: { color: Colors.danger, fontSize: 11, fontWeight: FontWeight.bold },

  // Toolbar
  toolbar: { backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sortRow: { flexDirection: 'row-reverse', gap: Spacing.sm },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  sortChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sortChipText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  sortChipTextActive: { color: Colors.white },

  // Category bar
  catBarOuter: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  catBarInner: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  catChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  catChipTextActive: { color: Colors.white },

  // List view
  list: { paddingBottom: 120 },
  listRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.md,
    minHeight: 68,
  },
  listImg: { width: 48, height: 48, borderRadius: Radius.md },
  listImgPlaceholder: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  listMid: { flex: 1, alignItems: 'flex-end', gap: 4 },
  listName: { fontSize: FontSize.md, color: Colors.text, fontWeight: FontWeight.semibold, textAlign: 'right' },
  listTags: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4 },
  catTag: { backgroundColor: Colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  catTagText: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  listRight: { alignItems: 'center', gap: 4, minWidth: 70 },
  listPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  qtyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primarySoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  qtyBadgeLow: { backgroundColor: Colors.dangerSoft },
  qtyBadgeText: { fontSize: 11, color: Colors.primaryDark, fontWeight: FontWeight.bold },

  // Grid view
  gridList: { padding: Spacing.md, paddingBottom: 120 },
  gridRow: { gap: Spacing.md, marginBottom: Spacing.md },
  gridCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  gridImg: { width: '100%', height: 120 },
  gridImgPlaceholder: { width: '100%', height: 120, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  gridContent: { padding: Spacing.md, gap: 4, alignItems: 'flex-end' },
  gridName: { fontSize: FontSize.sm, color: Colors.text, fontWeight: FontWeight.semibold, textAlign: 'right' },
  gridPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  gridQty: { backgroundColor: Colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  gridQtyLow: { backgroundColor: Colors.dangerSoft },
  gridQtyText: { fontSize: 11, color: Colors.primaryDark, fontWeight: FontWeight.bold },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, left: 20,
    width: 60, height: 60, borderRadius: Radius.full,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center', justifyContent: 'center', ...Shadow.md,
  },
  fabSmall: {
    position: 'absolute', bottom: 100, left: 28,
    width: 44, height: 44, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },

  // Form
  fieldLabel: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: 8, textAlign: 'right' },
  qtyRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, minHeight: 52 },
  unitChip: { paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.full, margin: 6 },
  unitText: { color: Colors.primary, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  qtyDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  priceRow: { flexDirection: 'row-reverse', gap: Spacing.md },
  addLink: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-end', gap: 4, paddingVertical: Spacing.sm },
  addLinkText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  expanded: { gap: Spacing.md },
  customPriceRow: { flexDirection: 'row-reverse', gap: Spacing.sm, backgroundColor: Colors.surfaceAlt, padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  actBtnSmall: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  imagesHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  imgWrap: { position: 'relative', marginLeft: Spacing.sm },
  img: { width: 80, height: 80, borderRadius: Radius.md },
  imgRemove: { position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: Radius.full, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuLabel: { flex: 1, color: Colors.text, fontSize: FontSize.md, textAlign: 'right' },
});
