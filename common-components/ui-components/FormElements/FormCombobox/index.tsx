import {
  CSSProperties,
  FC,
  FocusEvent as ReactFocusEvent,
  ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { MdArrowDropDown, MdExpandMore, MdSearch } from 'react-icons/md';

import { Button, Icon } from '../..';
import './FormCombobox.scss';

type FormComboboxOption = {
  readonly label: string;
  readonly value: string;
};

type FormComboboxBaseProps = {
  readonly label?: ReactNode;
  readonly name?: string;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly options: FormComboboxOption[];
  readonly hideLabel?: boolean;
  readonly disabled?: boolean;
  readonly style?: CSSProperties;
  readonly isSearchEnabled?: boolean;
  readonly hideInputStyle?: boolean;
  readonly isMenuPortaled?: boolean;
  readonly allOptionValue?: string;
  readonly direction?: 'down' | 'up';
  readonly selectedOptionsCount?: number;
  readonly preserveOptionsOrder?: boolean;
};

type FormComboboxSingleProps = FormComboboxBaseProps & {
  readonly multiple?: false;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly onSelectionChange?: (selection: FormComboboxOption | null) => void;
};

type FormComboboxMultipleProps = FormComboboxBaseProps & {
  readonly multiple: true;
  readonly value?: string[];
  readonly defaultValue?: string[];
  readonly onChange?: (value: string[]) => void;
  readonly onSelectionChange?: (selection: FormComboboxOption[] | null) => void;
  readonly isApplyBtnVisible?: boolean;
};

type FormComboboxProps = FormComboboxSingleProps | FormComboboxMultipleProps;

type FormComboboxValueProps =
  | {
      readonly multiple?: false;
      readonly value?: string;
      readonly defaultValue?: string;
    }
  | {
      readonly multiple: true;
      readonly value?: string[];
      readonly defaultValue?: string[];
    };

const getInitialSingleValue = (props: FormComboboxValueProps): string => {
  if (props.multiple === true) {
    return '';
  }

  return props.defaultValue ?? '';
};

const getInitialMultipleValue = (props: FormComboboxValueProps): string[] => {
  if (!props.multiple) {
    return [];
  }

  return props.defaultValue ?? [];
};

const getSelectedValues = (
  props: FormComboboxValueProps,
  internalSingleValue: string,
  internalMultipleValue: string[]
): string[] => {
  if (props.multiple === true) {
    return props.value ?? internalMultipleValue;
  }

  if (props.value) {
    return [props.value];
  }

  if (internalSingleValue) {
    return [internalSingleValue];
  }

  return [];
};

const orderSelectedOptionsFirst = (
  options: FormComboboxOption[],
  selectedValues: string[],
  allOptionValue?: string
): FormComboboxOption[] => {
  const allOption = allOptionValue
    ? options.find((option) => option.value === allOptionValue)
    : undefined;

  if (selectedValues.length === 0) return options;

  const selectedValueSet = new Set(selectedValues);
  const selectedOptions: FormComboboxOption[] = [];
  const unselectedOptions: FormComboboxOption[] = [];

  options.forEach((option) => {
    if (option === allOption) return;

    if (selectedValueSet.has(option.value)) {
      selectedOptions.push(option);
      return;
    }

    unselectedOptions.push(option);
  });

  return [...(allOption ? [allOption] : []), ...selectedOptions, ...unselectedOptions];
};

const getNextMultipleValues = (
  option: FormComboboxOption,
  options: FormComboboxOption[],
  selectedValues: string[],
  allOptionValue?: string
): string[] => {
  if (!allOptionValue) {
    return selectedValues.includes(option.value)
      ? selectedValues.filter((value) => value !== option.value)
      : [...selectedValues, option.value];
  }

  const optionValues = options.map((item) => item.value);
  const realOptionValues = optionValues.filter((value) => value !== allOptionValue);

  if (option.value === allOptionValue) {
    return selectedValues.includes(allOptionValue) ? [] : [allOptionValue, ...realOptionValues];
  }

  const nextRealValues = selectedValues.includes(option.value)
    ? selectedValues.filter((value) => value !== option.value && value !== allOptionValue)
    : [...selectedValues.filter((value) => value !== allOptionValue), option.value];

  if (
    realOptionValues.length > 0 &&
    realOptionValues.every((value) => nextRealValues.includes(value))
  ) {
    return [allOptionValue, ...realOptionValues];
  }

  return nextRealValues;
};

export const FormCombobox: FC<FormComboboxProps> = ({
  label,
  hideLabel,
  placeholder,
  searchPlaceholder,
  options,
  disabled,
  style,
  isSearchEnabled = false,
  hideInputStyle = false,
  isMenuPortaled = false,
  allOptionValue,
  direction = 'up',
  preserveOptionsOrder = false,
  ...props
}) => {
  const id = useId();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [internalSingleValue, setInternalSingleValue] = useState<string>(
    getInitialSingleValue(props)
  );
  const [internalMultipleValue, setInternalMultipleValue] = useState<string[]>(
    getInitialMultipleValue(props)
  );
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isMultiple = props.multiple === true;
  const isApplyBtnVisible = props.multiple === true ? props.isApplyBtnVisible : false;
  const selectedValues = useMemo(() => (
    getSelectedValues(props, internalSingleValue, internalMultipleValue)
  ), [props.multiple, props.value, internalSingleValue, internalMultipleValue]);
  const [draftMultipleValue, setDraftMultipleValue] = useState<string[]>(selectedValues);
  const menuSelectedValues = isApplyBtnVisible ? draftMultipleValue : selectedValues;
  const [menuOptionsOrder, setMenuOptionsOrder] = useState<FormComboboxOption[]>(() => (
    preserveOptionsOrder ? options : orderSelectedOptionsFirst(options, selectedValues, allOptionValue)
  ));

  const orderedOptions = isOpen ? menuOptionsOrder : options;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return orderedOptions;

    return orderedOptions.filter((option) => (
      option.label.toLowerCase().includes(normalizedQuery)
    ));
  }, [orderedOptions, query]);

  const selectedOptions = useMemo(() => (
    options.filter((option) => selectedValues.includes(option.value))
  ), [options, selectedValues]);

  const updateMenuPosition = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();

    if (!triggerRect) return;

    const offset = 10;

    setMenuStyle({
      left: triggerRect.left,
      minWidth: hideInputStyle ? 296 : triggerRect.width,
      top: triggerRect.bottom + offset,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen || !isMenuPortaled) return;

    updateMenuPosition();

    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [hideInputStyle, isMenuPortaled, isOpen]);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (isApplyBtnVisible) {
        setDraftMultipleValue(selectedValues);
      }

      setMenuOptionsOrder(
        preserveOptionsOrder ? options : orderSelectedOptionsFirst(options, selectedValues, allOptionValue)
      );
    }
  }, [isOpen, isApplyBtnVisible]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        !wrapperRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  const closeOnFocusOutside = (event: ReactFocusEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as Node | null;

    if (
      !event.currentTarget.contains(relatedTarget) &&
      !menuRef.current?.contains(relatedTarget)
    ) {
      setIsOpen(false);
      setQuery('');
    }
  };

  const setSingleValue = (option: FormComboboxOption) => {
    if (props.multiple) return;
    const singleProps = props as FormComboboxSingleProps;
    const nextValue = selectedValues.includes(option.value) ? '' : option.value;
    const nextSelection = nextValue ? option : null;

    if (singleProps.value === undefined) {
      setInternalSingleValue(nextValue);
    }

    singleProps.onChange?.(nextValue);
    singleProps.onSelectionChange?.(nextSelection);
    setIsOpen(false);
    setQuery('');
  };

  const setMultipleValue = (option: FormComboboxOption) => {
    if (!props.multiple) return;
    const multipleProps = props as FormComboboxMultipleProps;

    const currentValues = isApplyBtnVisible ? draftMultipleValue : selectedValues;
    const nextValues = getNextMultipleValues(option, options, currentValues, allOptionValue);
    const nextSelection = options.filter((item) => nextValues.includes(item.value));

    if (isApplyBtnVisible) {
      setDraftMultipleValue(nextValues);
      return;
    }

    if (multipleProps.value === undefined) {
      setInternalMultipleValue(nextValues);
    }

    multipleProps.onChange?.(nextValues);
    multipleProps.onSelectionChange?.(nextSelection.length ? nextSelection : null);
  };

  const selectOption = (option: FormComboboxOption) => {
    if (disabled) return;

    if (props.multiple) {
      setMultipleValue(option);
      return;
    }

    setSingleValue(option);
  };

  const applyMultipleValue = () => {
    if (!props.multiple) return;

    const multipleProps = props as FormComboboxMultipleProps;

    if (multipleProps.value === undefined) {
      setInternalMultipleValue(draftMultipleValue);
    }

    multipleProps.onChange?.(draftMultipleValue);
    const nextSelection = options.filter((item) => draftMultipleValue.includes(item.value));

    multipleProps.onSelectionChange?.(nextSelection.length ? nextSelection : null);
    setIsOpen(false);
    setQuery('');
  };

  const placeholderValue = placeholder || t('global.choose');
  const triggerLabel = isMultiple
    ? selectedOptions.length > 0
      ? props.selectedOptionsCount !== undefined
        ? `${placeholder ?? t('global.chosen')} (${props.selectedOptionsCount})`
        : selectedOptions.map((option) => option.label).join(', ')
      : placeholderValue
    : selectedOptions[0]?.label ?? placeholderValue;
  const triggerContent = hideInputStyle ? label ?? triggerLabel : triggerLabel;

  const selectClasses = clsx(
    'select',
    disabled && 'select--disabled',
    isOpen && 'select--open',
    hideInputStyle && 'select--plain',
  );

  const menu = (
    <div
      ref={menuRef}
      className={clsx(
        'select__menu select__menu--combobox',
        `select__menu--${direction}`,
        isMenuPortaled && 'select__menu--portal'
      )}
      style={isMenuPortaled ? menuStyle : undefined}
    >
      {
        isSearchEnabled && <div className='select__search'>
          <Icon
            label='Search icon'
            size='medium'
            className='select__search-icon'
            icon={<MdSearch className='search__icon-size' color='#5D6071' />}
          />
          <input
            ref={searchInputRef}
            className='select__search-input'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder ?? t('global.search')}
            disabled={disabled}
          />
        </div>
      }

      <ul className='select__options' role='listbox' aria-label={searchPlaceholder ?? t('global.search')}>
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const isSelected = menuSelectedValues.includes(option.value);

            return (
              <li
                key={option.value}
                role='option'
                aria-selected={isSelected}
                className='select__option select__option--combobox'
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  checked={isSelected}
                  value={option.value}
                  onChange={() => null}
                />
                <span>{option.label}</span>
              </li>
            );
          })
        ) : null}
      </ul>

      {isApplyBtnVisible && (
        <div className='select__actions'>
          <Button
            size='s'
            type='button'
            onClick={applyMultipleValue}
            disabled={disabled}
          >
            {t('global.apply')}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div ref={wrapperRef} className={selectClasses} style={style} onBlur={closeOnFocusOutside}>
      {label && !hideLabel && <label htmlFor={id} className='select__label'>{label}</label>}
      <div className='select__wrapper'>
        <button
          ref={triggerRef}
          id={id}
          type='button'
          className='select__trigger'
          aria-label={hideInputStyle && typeof label === 'string' ? label : undefined}
          aria-haspopup='listbox'
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className='select__trigger-text'>{triggerContent}</span>
          <Icon
            label='Dropdown icon'
            size='medium'
            icon={hideInputStyle ? <MdExpandMore color='#5D6071' /> : <MdArrowDropDown color='#5D6071' />}
          />
        </button>

        {isOpen && (
          isMenuPortaled && typeof document !== 'undefined'
            ? createPortal(menu, document.body)
            : menu
        )}
      </div>
    </div>
  );
};

export default FormCombobox;
