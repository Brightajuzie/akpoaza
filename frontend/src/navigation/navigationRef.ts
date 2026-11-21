import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

/**
 * Safely navigates to a screen anywhere in the app.
 */
export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

/**
 * Automatically resets the navigation stack and brings the user directly to Login
 * when a session expires or user is logged off.
 */
export function resetToLogin() {
  if (navigationRef.isReady()) {
    try {
      const currentRoute = navigationRef.getCurrentRoute()?.name;
      // If already on Login, Signup, or Onboarding, no need to reset stack
      if (currentRoute === 'Login' || currentRoute === 'Signup' || currentRoute === 'Onboarding') {
        return;
      }
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        })
      );
    } catch (err) {
      console.warn('[NavigationRef] Error resetting to Login:', err);
    }
  }
}
