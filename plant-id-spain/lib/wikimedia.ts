/**
 * Wikimedia enforces a User-Agent policy and returns 403 Forbidden to requests
 * with no (or a generic/default) User-Agent header — which is what React Native's
 * Image component sends on Android by default. Pass this as `source.headers` on
 * any <Image> loading a `upload.wikimedia.org` URL.
 * https://meta.wikimedia.org/wiki/User-Agent_policy
 */
export const WIKIMEDIA_IMAGE_HEADERS = {
  "User-Agent": "FloraDexEspana/1.0 (personal hobby app; contact: n/a)",
};
