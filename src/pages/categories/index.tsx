import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import type { Category, CategoryKind } from '@/types/ledger';
import { getCategories, mutateCategory } from '@/services/ledger';
import { CATEGORY_ICONS, PALETTE, pickColor } from '@/utils/palette';
import BottomSheet from '@/components/BottomSheet';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import SegmentedControl from '@/components/SegmentedControl';
import styles from './index.module.scss';

const KIND_OPTIONS = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' }
];

const CategoriesPage: React.FC = () => {
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [sheetVisible, setSheetVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string>('');
  const [editingSystem, setEditingSystem] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [icon, setIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      console.error('[Categories] 加载失败', err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => categories.filter((item) => item.kind === kind), [categories, kind]);

  const openCreate = () => {
    setEditingId('');
    setEditingSystem(false);
    setName('');
    setIcon(CATEGORY_ICONS[0]);
    setColor(pickColor(list.length));
    setSheetVisible(true);
  };

  const openEdit = (category: Category) => {
    setEditingId(category._id);
    setEditingSystem(category.isSystem);
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) {
      Taro.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await mutateCategory({
        action: editingId ? 'update' : 'create',
        id: editingId || undefined,
        name: name.trim(),
        kind,
        icon,
        color
      });
      Taro.showToast({ title: editingId ? '已保存' : '已创建', icon: 'success' });
      setSheetVisible(false);
      await load();
    } catch (err) {
      console.error('[Categories] 保存失败', err);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingId || editingSystem) return;
    Taro.showModal({
      title: '删除分类',
      content: '删除后该分类的历史流水将显示为未分类，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await mutateCategory({ action: 'delete', id: editingId });
          Taro.showToast({ title: '已删除', icon: 'success' });
          setSheetVisible(false);
          await load();
        } catch (err) {
          console.error('[Categories] 删除失败', err);
          Taro.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  };

  return (
    <View className="pageRoot">
      <View className={styles.kindBar}>
        <SegmentedControl
          options={KIND_OPTIONS}
          value={kind}
          onChange={(value) => setKind(value as CategoryKind)}
        />
      </View>

      <View className={styles.listHeader}>
        <Text className={styles.listTitle}>
          {kind === 'expense' ? '支出分类' : '收入分类'}（{list.length}）
        </Text>
      </View>

      {list.length > 0 ? (
        list.map((category) => (
          <View key={category._id} className={styles.catRow} onClick={() => openEdit(category)}>
            <CategoryIcon icon={category.icon} color={category.color} size={80} />
            <View className={styles.catBody}>
              <Text className={styles.catName}>{category.name}</Text>
              {category.isSystem ? <Text className={styles.catBadge}>系统</Text> : null}
            </View>
            <Text className={styles.catArrow}>›</Text>
          </View>
        ))
      ) : (
        <EmptyState icon="🏷️" title="该类型暂无分类" desc="点击下方按钮新建一个分类" />
      )}

      <View className={styles.addBtn} onClick={openCreate}>
        <Text className={styles.addText}>＋ 新建分类</Text>
      </View>

      <BottomSheet
        visible={sheetVisible}
        title={editingId ? '编辑分类' : '新建分类'}
        onClose={() => setSheetVisible(false)}
      >
        <ScrollView scrollY className={styles.sheetScroll}>
          <View className={styles.formRow}>
            <Text className={styles.formLabel}>名称</Text>
            <Input
              className={styles.formInput}
              value={name}
              placeholder="分类名称"
              onInput={(event) => setName(event.detail.value)}
            />
          </View>

          <Text className={styles.formTitle}>图标</Text>
          <View className={styles.iconList}>
            {CATEGORY_ICONS.map((item) => (
              <View
                key={item}
                className={classnames(styles.iconChip, item === icon && styles.iconChipActive)}
                onClick={() => setIcon(item)}
              >
                <Text className={styles.iconText}>{item}</Text>
              </View>
            ))}
          </View>

          <Text className={styles.formTitle}>颜色</Text>
          <View className={styles.colorList}>
            {PALETTE.map((item) => (
              <View
                key={item}
                className={classnames(styles.colorChip, item === color && styles.colorChipActive)}
                style={{ backgroundColor: item }}
                onClick={() => setColor(item)}
              />
            ))}
          </View>

          <View className={styles.sheetActions}>
            {editingId && !editingSystem ? (
              <View className={styles.deleteBtn} onClick={handleDelete}>
                <Text className={styles.deleteText}>删除</Text>
              </View>
            ) : null}
            <View className={styles.saveBtn} onClick={handleSave}>
              <Text className={styles.saveText}>{submitting ? '保存中…' : '保存'}</Text>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CategoriesPage;
