import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badgeText?: string;
  keywords?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
  triggerStyle?: React.CSSProperties;
  menuMinWidth?: number;
  maxMenuHeight?: number;
  fallbackLabel?: string;
}

/**
 * Chuẩn hóa chuỗi tiếng Việt về dạng không dấu, chữ thường để hỗ trợ tìm kiếm nhanh.
 */
const normalizeSearchText = (input: string): string =>
  String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '-- Chọn --',
  searchPlaceholder = 'Nhập để tìm nhanh...',
  emptyText = 'Không tìm thấy kết quả phù hợp',
  disabled = false,
  ariaLabel,
  title,
  className,
  triggerStyle,
  menuMinWidth = 260,
  maxMenuHeight = 340,
  fallbackLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return options;
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const haystack = normalizeSearchText(
        `${opt.label} ${opt.subLabel || ''} ${opt.badgeText || ''} ${opt.keywords || ''}`
      );
      return tokens.every((token) => haystack.includes(token));
    });
  }, [options, query]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 8;
    const gap = 4;

    const desiredWidth = Math.min(
      Math.max(rect.width, menuMinWidth),
      viewportWidth - margin * 2
    );
    let left = rect.left;
    if (left + desiredWidth > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - desiredWidth - margin);
    }
    left = Math.max(margin, left);

    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < Math.min(220, maxMenuHeight) && spaceAbove > spaceBelow;
    const availableHeight = openUpward ? spaceAbove - gap : spaceBelow - gap;
    const resolvedMaxHeight = Math.max(180, Math.min(maxMenuHeight, availableHeight));

    if (openUpward) {
      setMenuStyle({
        position: 'fixed',
        left,
        bottom: viewportHeight - rect.top + gap,
        width: desiredWidth,
        maxHeight: resolvedMaxHeight,
        zIndex: 1000020,
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        left,
        top: rect.bottom + gap,
        width: desiredWidth,
        maxHeight: resolvedMaxHeight,
        zIndex: 1000020,
      });
    }
  }, [maxMenuHeight, menuMinWidth]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    updatePosition();
    const selectedIdx = filteredOptions.findIndex((opt) => opt.value === value && !opt.disabled);
    const firstEnabledIdx = filteredOptions.findIndex((opt) => !opt.disabled);
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : Math.max(0, firstEnabledIdx));

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);

    const handleOutsideMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      updatePosition();
    };

    const handleResize = () => updatePosition();

    document.addEventListener('mousedown', handleOutsideMouseDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, updatePosition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const firstEnabledIdx = filteredOptions.findIndex((opt) => !opt.disabled);
    setHighlightedIndex(firstEnabledIdx >= 0 ? firstEnabledIdx : 0);
  }, [query, open, filteredOptions]);

  useEffect(() => {
    if (!open) return;
    const el = optionRefs.current[highlightedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, open]);

  const moveHighlight = (direction: 1 | -1) => {
    if (filteredOptions.length === 0) return;
    let next = highlightedIndex;
    for (let step = 0; step < filteredOptions.length; step += 1) {
      next = (next + direction + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[next]?.disabled) {
        setHighlightedIndex(next);
        return;
      }
    }
  };

  const handleSelect = (opt: SearchableSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    window.setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const target =
        filteredOptions[highlightedIndex] && !filteredOptions[highlightedIndex].disabled
          ? filteredOptions[highlightedIndex]
          : filteredOptions.find((opt) => !opt.disabled);
      if (target) {
        handleSelect(target);
      }
    }
  };

  const displayText = selectedOption?.label ?? fallbackLabel ?? placeholder;
  const isPlaceholder = !selectedOption && !fallbackLabel;

  const baseTriggerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid var(--dm-border-strong)',
    background: disabled ? 'var(--dm-surface-subtle)' : 'var(--dm-surface)',
    color: isPlaceholder ? 'var(--dm-text-muted)' : 'var(--dm-text-strong)',
    fontSize: '12.5px',
    fontWeight: 500,
    lineHeight: 1.4,
    textAlign: 'left',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    boxSizing: 'border-box',
    maxWidth: '100%',
    fontFamily: 'inherit',
    ...triggerStyle,
    ...(open
      ? {
          borderColor: '#0284c7',
          boxShadow: '0 0 0 2px rgba(2, 132, 199, 0.16)',
        }
      : {}),
  };

  const menuContent =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel || placeholder}
            style={{
              ...menuStyle,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--dm-surface)',
              borderRadius: '10px',
              border: '1px solid var(--dm-border-strong)',
              boxShadow:
                '0 14px 36px -6px rgba(15, 23, 42, 0.22), 0 6px 14px -4px rgba(15, 23, 42, 0.08)',
              overflow: 'hidden',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          >
            {/* Thanh tìm kiếm cố định phía trên danh sách */}
            <div
              style={{
                padding: '8px',
                borderBottom: '1px solid var(--dm-border)',
                backgroundColor: 'var(--dm-surface-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 10px',
                  borderRadius: '7px',
                  border: '1px solid var(--dm-border-strong)',
                  backgroundColor: 'var(--dm-surface)',
                }}
              >
                <Search size={14} style={{ color: 'var(--dm-text-muted)', flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: '12.5px',
                    color: 'var(--dm-text-strong)',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchInputRef.current?.focus();
                    }}
                    title="Xóa từ khóa"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--dm-text-muted)',
                      cursor: 'pointer',
                      padding: '1px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Danh sách lựa chọn */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '5px',
                overscrollBehavior: 'contain',
              }}
            >
              {filteredOptions.length === 0 ? (
                <div
                  style={{
                    padding: '18px 12px',
                    fontSize: '12.5px',
                    color: 'var(--dm-text-muted)',
                    textAlign: 'center',
                  }}
                >
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightedIndex && !opt.disabled;
                  return (
                    <button
                      key={`${opt.value}-${idx}`}
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onMouseEnter={() => {
                        if (!opt.disabled) setHighlightedIndex(idx);
                      }}
                      onClick={() => handleSelect(opt)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '7px 10px',
                        border: 'none',
                        borderRadius: '7px',
                        backgroundColor: isSelected
                          ? 'var(--dm-blue-bg)'
                          : isHighlighted
                            ? 'var(--dm-surface-muted)'
                            : 'transparent',
                        color: opt.disabled
                          ? 'var(--dm-text-muted)'
                          : isSelected
                            ? 'var(--dm-blue-text)'
                            : 'var(--dm-text-strong)',
                        cursor: opt.disabled ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 600 : 500,
                        lineHeight: 1.35,
                        fontFamily: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1px',
                        }}
                      >
                        <span style={{ wordBreak: 'break-word' }}>{opt.label}</span>
                        {opt.subLabel && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: isSelected ? 'var(--dm-blue-text)' : 'var(--dm-text-muted)',
                              fontWeight: 400,
                              wordBreak: 'break-word',
                            }}
                          >
                            {opt.subLabel}
                          </span>
                        )}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexShrink: 0,
                        }}
                      >
                        {opt.badgeText && (
                          <span
                            style={{
                              fontSize: '10.5px',
                              color: isSelected ? 'var(--dm-blue-text)' : 'var(--dm-text-muted)',
                              backgroundColor: isSelected ? 'var(--dm-blue-bg)' : 'var(--dm-surface-muted)',
                              padding: '1px 6px',
                              borderRadius: '999px',
                              fontWeight: 600,
                            }}
                          >
                            {opt.badgeText}
                          </span>
                        )}
                        {isSelected && <Check size={14} style={{ color: 'var(--dm-blue-text)' }} />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {options.length > 8 && (
              <div
                style={{
                  padding: '5px 10px',
                  borderTop: '1px solid var(--dm-border)',
                  backgroundColor: 'var(--dm-surface-subtle)',
                  fontSize: '11px',
                  color: 'var(--dm-text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <span>
                  {query.trim()
                    ? `Tìm thấy ${filteredOptions.length} / ${options.length} mục`
                    : `${options.length} lựa chọn`}
                </span>
                <span>Enter để chọn • Esc để đóng</span>
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={title || displayText}
        disabled={disabled}
        className={className}
        style={baseTriggerStyle}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayText}
        </span>
        <ChevronDown
          size={15}
          style={{
            flexShrink: 0,
            color: 'var(--dm-text-muted)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>
      {menuContent}
    </>
  );
};
