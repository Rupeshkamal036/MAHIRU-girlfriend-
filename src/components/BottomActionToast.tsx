import React from 'react';

export interface ActionToastData {
  id?: number;
  title: string;
  description: string;
  state?: 'on' | 'off' | 'success';
}

/**
 * Programmatic helper to trigger a bottom action status anywhere in the app.
 * Broadcasts an event that the existing FirstReferenceBottomControls status area reacts to.
 */
export function showBottomActionToast(
  title: string,
  description: string,
  state: 'on' | 'off' | 'success' = 'success'
) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('mahiru:bottom-action-toast', {
        detail: { title, description, state },
      })
    );
  }
}

/**
 * Backwards compatibility placeholder component.
 * The visual status is now rendered directly within the native status text area.
 */
export const BottomActionToast: React.FC<any> = () => null;
