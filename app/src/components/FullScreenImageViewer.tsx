import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

export interface ImagePreviewState {
  images: string[];
  index: number;
}

export interface FullScreenImageViewerProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  /**
   * Set false when rendering inside an already-open React Native <Modal>
   * so iOS does not silently block presenting a second Modal.
   */
  useModal?: boolean;
}

export const FullScreenImageViewer: React.FC<FullScreenImageViewerProps> = ({
  visible,
  images,
  initialIndex = 0,
  onClose,
  useModal = true,
}) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const safeImages = React.useMemo(
    () => images.filter((u): u is string => typeof u === 'string' && u.trim().length > 0),
    [images]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const currentIndexRef = useRef(0);

  useEffect(() => {
    if (!visible || safeImages.length === 0) return;
    const bounded = Math.max(0, Math.min(initialIndex, safeImages.length - 1));
    currentIndexRef.current = bounded;
    setActiveIndex(bounded);
    const frameId = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: bounded * windowWidth, animated: false });
    });
    return () => cancelAnimationFrame(frameId);
  }, [visible, initialIndex, safeImages.length, windowWidth]);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (safeImages.length <= 1) return;
      const wrapped = ((nextIndex % safeImages.length) + safeImages.length) % safeImages.length;
      currentIndexRef.current = wrapped;
      setActiveIndex(wrapped);
      scrollRef.current?.scrollTo({ x: wrapped * windowWidth, animated: true });
    },
    [safeImages.length, windowWidth]
  );

  if (!visible || safeImages.length === 0) return null;

  const hasMultiple = safeImages.length > 1;
  const topOffset = Math.max(insets.top + 8, Platform.OS === 'android' ? 36 : 48);
  const bottomOffset = Math.max(insets.bottom + 12, 20);
  const imageMaxHeight = Math.max(240, windowHeight - topOffset - bottomOffset - (hasMultiple ? 110 : 50));

  const content = (
    <View style={styles.backdrop}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Top Header: Counter + Close */}
      <View style={[styles.topBar, { paddingTop: topOffset }]} pointerEvents="box-none">
        <View style={styles.topSideSpacer} />
        {hasMultiple ? (
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {activeIndex + 1} / {safeImages.length}
            </Text>
          </View>
        ) : (
          <View style={styles.topSideSpacer} />
        )}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Đóng xem ảnh"
        >
          <Feather name="x" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Main Horizontal Paging Images */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={hasMultiple}
        onLayout={() => {
          scrollRef.current?.scrollTo({
            x: currentIndexRef.current * windowWidth,
            animated: false,
          });
        }}
        onMomentumScrollEnd={(e) => {
          if (windowWidth <= 0) return;
          const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
          const bounded = Math.max(0, Math.min(idx, safeImages.length - 1));
          currentIndexRef.current = bounded;
          setActiveIndex(bounded);
        }}
      >
        {safeImages.map((uri, idx) => (
          <View
            key={`${uri}-${idx}`}
            style={[styles.slide, { width: windowWidth, height: windowHeight }]}
          >
            <Image
              source={{ uri }}
              style={{
                width: windowWidth,
                height: imageMaxHeight,
              }}
              resizeMode="contain"
            />
          </View>
        ))}
      </ScrollView>

      {/* Back / Next Floating Arrows when multiple images exist */}
      {hasMultiple && (
        <>
          <TouchableOpacity
            style={[styles.navArrowBtn, styles.navArrowLeft]}
            onPress={() => goToIndex(activeIndex - 1)}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Ảnh trước"
          >
            <Feather name="chevron-left" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navArrowBtn, styles.navArrowRight]}
            onPress={() => goToIndex(activeIndex + 1)}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Ảnh tiếp theo"
          >
            <Feather name="chevron-right" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Bottom Thumbnail Strip */}
          <View style={[styles.thumbBar, { paddingBottom: bottomOffset }]} pointerEvents="box-none">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbScrollContent}
            >
              {safeImages.map((uri, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <TouchableOpacity
                    key={`thumb-${uri}-${idx}`}
                    onPress={() => goToIndex(idx)}
                    activeOpacity={0.85}
                    style={[styles.thumbItem, isActive && styles.thumbItemActive]}
                  >
                    <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );

  if (!useModal) {
    return (
      <View style={styles.inlineOverlay} pointerEvents="auto">
        {content}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
};

const styles = StyleSheet.create({
  inlineOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topSideSpacer: {
    width: 40,
    height: 40,
  },
  counterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -23,
    zIndex: 30,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowLeft: {
    left: 12,
  },
  navArrowRight: {
    right: 12,
  },
  thumbBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingTop: 10,
    alignItems: 'center',
  },
  thumbScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  thumbItem: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    opacity: 0.6,
  },
  thumbItemActive: {
    borderColor: '#FFFFFF',
    opacity: 1,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
});
