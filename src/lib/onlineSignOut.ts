import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useStatusStore } from "@/lib/store";

/**
 * Signs the user out of Zaparoo Online.
 *
 * RevenueCat is deliberately not touched here: the app's auth-state listener
 * returns it to an anonymous customer through the purchases identity queue, so
 * the reset cannot interleave with a purchase or restore already in flight.
 */
export async function signOutOnline(): Promise<void> {
  await FirebaseAuthentication.signOut();
  useStatusStore.getState().setLoggedInUser(null);
}
