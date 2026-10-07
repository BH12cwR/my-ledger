import React, { useCallback, useEffect, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import type { Tag } from '@/types/ledger';
import { getTags, mutateTag } from '@/services/ledger';
import { PALETTE, pickColor } from '@/utils/palette';
import BottomSheet from '@/components/BottomSheet';
import EmptyState from '@/components/EmptyState';
import styles from './index.module.scss';

const TagsPage: React.FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [sheetVisible, setSheetVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const data = await getTags();
      setTags(data);
    } catch (err) {
      console.error('[Tags] 加载失败', err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId('');
    setName('');
    setColor(pickColor(tags.length));
    setSheetVisible(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingId(tag._id);
    setName(tag.name);
    setColor(tag.color);
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) {
      Taro.showToast({ title: '请输入标签名称', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await mutateTag({
        action: editingId ? 'update' : 'create',
        id: editingId || undefined,
        name: name.trim(),
        color
      });
      Taro.showToast({ title: editingId ? '已保存' : '已创建', icon: 'success' });
      setSheetVisible(false);
      await load();
    } catch (err) {
      console.error('[Tags] 保存失败', err);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingId) return;
    Taro.showModal({
      title: '删除标签',
      content: '删除后已使用该标签的流水将不再显示此标签，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await mutateTag({ action: 'delete', id: editingId });
          Taro.showToast({ title: '已删除', icon: 'success' });
          setSheetVisible(false);
          await load();
        } catch (err) {
          console.error('[Tags] 删除失败', err);
          Taro.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  };

  return (
    <View className="pageRoot">
      <View className={styles.listHeader}>
        <Text className={styles.listTitle}>共 {tags.length} 个标签</Text>
      </View>

      {tags.length > 0 ? (
        tags.map((tag) => (
          <View key={tag._id} className={styles.tagRow} onClick={() => openEdit(tag)}>
            <View className={styles.dot} style={{ backgroundColor: tag.color }} />
            <Text className={styles.tagName}>{tag.name}</Text>
            <Text className={styles.tagArrow}>›</Text>
          </View>
        ))
      ) : (
        <EmptyState icon="🏷️" title="还没有标签" desc="用标签给流水做更细的分类" />
      )}

      <View className={styles.addBtn} onClick={openCreate}>
        <Text className={styles.addText}>＋ 新建标签</Text>
      </View>

      <BottomSheet
        visible={sheetVisible}
        title={editingId ? '编辑标签' : '新建标签'}
        onClose={() => setSheetVisible(false)}
      >
        <ScrollView scrollY className={styles.sheetScroll}>
          <View className={styles.formRow}>
            <Text className={styles.formLabel}>名称</Text>
            <Input
              className={styles.formInput}
              value={name}
              placeholder="标签名称"
              onInput={(event) => setName(event.detail.value)}
            />
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
            {editingId ? (
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

export default TagsPage;
