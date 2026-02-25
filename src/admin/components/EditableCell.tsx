import React, { useState, useRef, useEffect } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../../config/api';

interface EditableCellProps {
  value: string;
  fieldName: string;
  clientId: string;
  creditorId: string;
  onSaved?: (newValue: string) => void;
  type?: 'text' | 'boolean' | 'textarea';
  fallbackValue?: string;
  transformBeforeSend?: (value: string) => any;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value,
  fieldName,
  clientId,
  creditorId,
  onSaved,
  type = 'text',
  fallbackValue = 'N/A',
  transformBeforeSend,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [originalValue, setOriginalValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayValue, setDisplayValue] = useState(value);

  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync displayValue when prop value changes from outside
  useEffect(() => {
    if (!editing) {
      setDisplayValue(value);
      setEditValue(value);
      setOriginalValue(value);
    }
  }, [value, editing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // Cleanup success timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (!editing && !saving) {
      setEditValue(displayValue);
      setOriginalValue(displayValue);
      setError(null);
      setEditing(true);
    }
  };

  const handleSave = async () => {
    if (editValue === originalValue) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let valueToSend: any;

      if (type === 'boolean') {
        // Convert "Ja"/"Nein" to boolean for backend
        valueToSend = editValue === 'Ja';
      } else if (transformBeforeSend) {
        valueToSend = transformBeforeSend(editValue);
      } else {
        valueToSend = editValue;
      }

      await api.put(`/api/admin/clients/${clientId}/creditors/${creditorId}`, {
        [fieldName]: valueToSend,
      });

      const newDisplay = editValue;
      setDisplayValue(newDisplay);
      setOriginalValue(newDisplay);
      setEditing(false);
      setSaving(false);

      // Show success checkmark briefly
      setShowSuccess(true);
      successTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
      }, 1500);

      if (onSaved) {
        onSaved(newDisplay);
      }
    } catch (err) {
      setSaving(false);
      setError('Speichern fehlgeschlagen');
      // Stay in edit mode so user can retry
    }
  };

  const handleCancel = () => {
    setEditValue(originalValue);
    setError(null);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleBlur = () => {
    // Small timeout to allow click on select options to register
    setTimeout(() => {
      if (editing) {
        handleSave();
      }
    }, 150);
  };

  const isEmpty = !displayValue || displayValue === fallbackValue;

  if (editing) {
    return (
      <div className="relative">
        {type === 'boolean' ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className={`border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-red-700 focus:border-red-700 ${
              error ? 'border-red-500' : 'border-gray-300'
            } ${saving ? 'opacity-50' : ''}`}
          >
            <option value="Ja">Ja</option>
            <option value="Nein">Nein</option>
          </select>
        ) : (
          <div className="relative flex items-center">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className={`border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-red-700 focus:border-red-700 w-full min-w-[120px] ${
                error ? 'border-red-500' : 'border-gray-300'
              } ${saving ? 'opacity-50' : ''}`}
            />
            {saving && (
              <span className="absolute right-2 inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        )}
        {error && (
          <p className="text-red-500 text-xs mt-0.5">{error}</p>
        )}
      </div>
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`inline-flex items-center hover:bg-gray-50 cursor-pointer rounded px-1 -mx-1 transition-colors max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${
        isEmpty ? 'text-gray-400' : 'text-gray-800'
      }`}
      title={displayValue || fallbackValue}
    >
      <span className="truncate">{displayValue || fallbackValue}</span>
      {showSuccess && (
        <CheckCircleIcon
          className="text-green-500 w-3 h-3 inline ml-1 flex-shrink-0 transition-opacity"
          style={{ opacity: showSuccess ? 1 : 0 }}
        />
      )}
    </span>
  );
};

export default EditableCell;
