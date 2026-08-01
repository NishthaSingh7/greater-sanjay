import { shell, systemPreferences } from 'electron';

import type { PermissionStatus } from '../../shared/types/task';

export function getPermissionStatus(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return { accessibility: true, screenRecording: true };
  }

  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  const screenRecording = systemPreferences.getMediaAccessStatus('screen') === 'granted';

  return { accessibility, screenRecording };
}

export function openAccessibilitySettings(): void {
  if (process.platform === 'darwin') {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    );
  }
}

export function openScreenRecordingSettings(): void {
  if (process.platform === 'darwin') {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    );
  }
}

export function requestAccessibilityPermission(): void {
  if (process.platform === 'darwin') {
    systemPreferences.isTrustedAccessibilityClient(true);
  }
}

export function assertPermissions(): void {
  const status = getPermissionStatus();
  const missing: string[] = [];

  if (!status.accessibility) {
    missing.push('Accessibility');
  }
  if (!status.screenRecording) {
    missing.push('Screen Recording');
  }

  if (missing.length > 0) {
    throw new Error(`Missing macOS permissions: ${missing.join(', ')}`);
  }
}
