import { useState, useEffect, useCallback, useRef } from 'react';

export interface SyncOptions<T> {
  initialData: T;
  formToJson: (formData: T) => string;
  jsonToForm: (jsonString: string) => T;
  validateJson?: (jsonString: string) => { valid: boolean; error?: string };
  debounceMs?: number;
  onError?: (error: string) => void;
}

export interface SyncState<T> {
  data: T;
  jsonText: string;
  error: string | null;
  isFormDirty: boolean;
  isJsonDirty: boolean;
  updateForm: (updater: (prev: T) => T) => void;
  updateJson: (jsonString: string) => void;
  resetSync: () => void;
  forceSync: (source: 'form' | 'json') => void;
}

export function useBidirectionalSync<T>({
  initialData,
  formToJson,
  jsonToForm,
  validateJson,
  debounceMs = 300,
  onError,
}: SyncOptions<T>): SyncState<T> {
  // Core state
  const [data, setData] = useState<T>(initialData);
  const [jsonText, setJsonText] = useState(() => formToJson(initialData));
  const [error, setError] = useState<string | null>(null);

  // Sync control
  const [syncSource, setSyncSource] = useState<'form' | 'json' | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [isJsonDirty, setIsJsonDirty] = useState(false);

  // Refs for debouncing
  const formTimeoutRef = useRef<NodeJS.Timeout>();
  const jsonTimeoutRef = useRef<NodeJS.Timeout>();
  const lastFormDataRef = useRef<T>(initialData);
  const lastJsonTextRef = useRef<string>(formToJson(initialData));

  // Error handling
  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    onError?.(errorMessage);
  }, [onError]);

  // Clear error when successful
  const clearError = useCallback(() => {
    if (error) setError(null);
  }, [error]);

  // Sync form data to JSON
  const syncFormToJson = useCallback((formData: T) => {
    try {
      const newJsonText = formToJson(formData);

      // Only update if content actually changed
      if (newJsonText !== lastJsonTextRef.current) {
        setJsonText(newJsonText);
        lastJsonTextRef.current = newJsonText;
        clearError();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to convert form to JSON';
      handleError(message);
    }
  }, [formToJson, handleError, clearError]);

  // Sync JSON to form data
  const syncJsonToForm = useCallback((jsonString: string) => {
    try {
      // Validate JSON if validator provided
      if (validateJson) {
        const validation = validateJson(jsonString);
        if (!validation.valid) {
          handleError(validation.error || 'Invalid JSON format');
          return;
        }
      }

      const newData = jsonToForm(jsonString);

      // Only update if content actually changed
      if (JSON.stringify(newData) !== JSON.stringify(lastFormDataRef.current)) {
        setData(newData);
        lastFormDataRef.current = newData;
        clearError();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to convert JSON to form';
      handleError(message);
    }
  }, [jsonToForm, validateJson, handleError, clearError]);

  // Debounced form update
  const updateForm = useCallback((updater: (prev: T) => T) => {
    setIsFormDirty(true);
    setSyncSource('form');

    setData(prev => {
      const newData = updater(prev);
      lastFormDataRef.current = newData;

      // Clear existing timeout
      if (formTimeoutRef.current) {
        clearTimeout(formTimeoutRef.current);
      }

      // Debounced sync to JSON
      formTimeoutRef.current = setTimeout(() => {
        if (syncSource === 'form') {
          syncFormToJson(newData);
          setIsFormDirty(false);
        }
      }, debounceMs);

      return newData;
    });
  }, [syncFormToJson, syncSource, debounceMs]);

  // Debounced JSON update
  const updateJson = useCallback((jsonString: string) => {
    setIsJsonDirty(true);
    setSyncSource('json');
    setJsonText(jsonString);
    lastJsonTextRef.current = jsonString;

    // Clear existing timeout
    if (jsonTimeoutRef.current) {
      clearTimeout(jsonTimeoutRef.current);
    }

    // Debounced sync to form
    jsonTimeoutRef.current = setTimeout(() => {
      if (syncSource === 'json') {
        syncJsonToForm(jsonString);
        setIsJsonDirty(false);
      }
    }, debounceMs);
  }, [syncJsonToForm, syncSource, debounceMs]);

  // Force sync from specific source
  const forceSync = useCallback((source: 'form' | 'json') => {
    // Clear any pending timeouts
    if (formTimeoutRef.current) clearTimeout(formTimeoutRef.current);
    if (jsonTimeoutRef.current) clearTimeout(jsonTimeoutRef.current);

    setSyncSource(source);

    if (source === 'form') {
      syncFormToJson(data);
      setIsFormDirty(false);
    } else {
      syncJsonToForm(jsonText);
      setIsJsonDirty(false);
    }
  }, [data, jsonText, syncFormToJson, syncJsonToForm]);

  // Reset to initial state
  const resetSync = useCallback(() => {
    // Clear timeouts
    if (formTimeoutRef.current) clearTimeout(formTimeoutRef.current);
    if (jsonTimeoutRef.current) clearTimeout(jsonTimeoutRef.current);

    // Reset state
    setData(initialData);
    setJsonText(formToJson(initialData));
    setError(null);
    setSyncSource(null);
    setIsFormDirty(false);
    setIsJsonDirty(false);

    // Update refs
    lastFormDataRef.current = initialData;
    lastJsonTextRef.current = formToJson(initialData);
  }, [initialData, formToJson]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (formTimeoutRef.current) clearTimeout(formTimeoutRef.current);
      if (jsonTimeoutRef.current) clearTimeout(jsonTimeoutRef.current);
    };
  }, []);

  // Reset when initialData changes
  useEffect(() => {
    resetSync();
  }, [initialData, resetSync]);

  return {
    data,
    jsonText,
    error,
    isFormDirty,
    isJsonDirty,
    updateForm,
    updateJson,
    resetSync,
    forceSync,
  };
}