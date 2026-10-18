/**
 * File dialogs are not available on the web. Returning `null` is what the app's
 * callers already treat as "the user cancelled", so the demo stays on its
 * sample paths instead of opening a native picker.
 */

export async function open(): Promise<null> {
  return null;
}

export async function save(): Promise<null> {
  return null;
}

export async function message(): Promise<void> {
  return undefined;
}

export async function ask(): Promise<boolean> {
  return false;
}

export async function confirm(): Promise<boolean> {
  return false;
}
