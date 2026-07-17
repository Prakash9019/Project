import { useState } from 'react';
import { useTheme } from '../theme';
import type { AlertConfig } from '../components/CustomAlert';

/**
 * Drives a single CustomAlert per screen and provides consistent presets so
 * every success/error/delete/leave dialog looks and reads identically. Wire it:
 *   const { alertConfig, hideAlert, confirm, alertError } = useAlert();
 *   <CustomAlert visible={!!alertConfig} onDismiss={hideAlert} {...alertConfig} />
 */
export function useAlert() {
  const { theme } = useTheme();
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  const showAlert = (config: AlertConfig) => setAlertConfig(config);
  const hideAlert = () => setAlertConfig(null);

  /** Cancel/Confirm dialog (optionally destructive). */
  const confirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    opts?: {
      destructive?: boolean;
      confirmLabel?: string;
      cancelLabel?: string;
      icon?: AlertConfig['icon'];
      iconColor?: string;
    },
  ) => {
    showAlert({
      title,
      message,
      icon: opts?.icon,
      iconColor: opts?.iconColor,
      buttons: [
        { label: opts?.cancelLabel ?? 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          label: opts?.confirmLabel ?? (opts?.destructive ? 'Delete' : 'Confirm'),
          style: opts?.destructive ? 'destructive' : 'default',
          onPress: () => {
            hideAlert();
            onConfirm();
          },
        },
      ],
    });
  };

  /** Single-button informational success dialog. Prefer a toast for lightweight cases. */
  const alertSuccess = (title: string, message?: string, onOk?: () => void) => {
    showAlert({
      title,
      message,
      icon: 'checkmark-circle',
      iconColor: theme.success,
      buttons: [
        {
          label: 'OK',
          style: 'default',
          onPress: () => {
            hideAlert();
            onOk?.();
          },
        },
      ],
    });
  };

  /** Error dialog — offers Try Again when a retry handler is supplied, otherwise a single OK. */
  const alertError = (title: string, message?: string, onRetry?: () => void) => {
    showAlert({
      title,
      message,
      icon: 'close-circle',
      iconColor: theme.error,
      buttons: onRetry
        ? [
            { label: 'Cancel', style: 'cancel', onPress: hideAlert },
            {
              label: 'Try Again',
              style: 'default',
              onPress: () => {
                hideAlert();
                onRetry();
              },
            },
          ]
        : [{ label: 'OK', style: 'default', onPress: hideAlert }],
    });
  };

  /** Warning confirmation (Cancel/Confirm) with a warning icon. */
  const alertWarning = (title: string, message: string, onConfirm: () => void) => {
    showAlert({
      title,
      message,
      icon: 'warning',
      iconColor: theme.warning,
      buttons: [
        { label: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          label: 'Confirm',
          style: 'default',
          onPress: () => {
            hideAlert();
            onConfirm();
          },
        },
      ],
    });
  };

  /** Standard destructive delete confirmation. */
  const deleteConfirm = (itemName: string, onDelete: () => void, message?: string) => {
    showAlert({
      title: `Delete ${itemName}?`,
      message: message ?? 'This action cannot be undone.',
      icon: 'trash',
      iconColor: theme.error,
      buttons: [
        { label: 'Cancel', style: 'cancel', onPress: hideAlert },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            hideAlert();
            onDelete();
          },
        },
      ],
    });
  };

  /** Standard "leave group" confirmation. */
  const leaveConfirm = (groupName: string, onLeave: () => void) => {
    showAlert({
      title: `Leave ${groupName}?`,
      message: 'You can rejoin if the group is public.',
      icon: 'log-out',
      iconColor: theme.error,
      buttons: [
        { label: 'Stay', style: 'cancel', onPress: hideAlert },
        {
          label: 'Leave',
          style: 'destructive',
          onPress: () => {
            hideAlert();
            onLeave();
          },
        },
      ],
    });
  };

  return {
    alertConfig,
    showAlert,
    hideAlert,
    confirm,
    alertSuccess,
    alertError,
    alertWarning,
    deleteConfirm,
    leaveConfirm,
  };
}
