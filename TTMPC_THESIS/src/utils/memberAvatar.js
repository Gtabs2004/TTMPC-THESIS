const PUBLIC_STORAGE_MARKER = '/storage/v1/object/public/Supporting_Documents/';

const normalizeAvatarObjectPath = (storedAvatarValue, userId) => {
  const rawValue = String(storedAvatarValue || '').trim();
  if (!rawValue || !userId) return '';

  if (rawValue.startsWith('http')) {
    const markerIndex = rawValue.indexOf(PUBLIC_STORAGE_MARKER);
    if (markerIndex === -1) return '';
    const encodedPath = rawValue.slice(markerIndex + PUBLIC_STORAGE_MARKER.length);
    return decodeURIComponent(encodedPath);
  }

  return rawValue;
};

export const createMemberAvatarSignedUrl = async (supabaseClient, userId, storedAvatarValue, expiresInSeconds = 60 * 60 * 24 * 7) => {
  if (!supabaseClient || !userId) return '';

  const objectPath = normalizeAvatarObjectPath(storedAvatarValue, userId);
  if (!objectPath) return '';
  if (!objectPath.startsWith(`profiles/${userId}/`)) return '';

  const { data, error } = await supabaseClient.storage
    .from('Supporting_Documents')
    .createSignedUrl(objectPath, expiresInSeconds);

  if (error) return '';
  return data?.signedUrl || '';
};

export const loadMemberAvatarSignedUrl = async (supabaseClient, userId, expiresInSeconds = 60 * 60 * 24 * 7) => {
  if (!supabaseClient || !userId) return '';

  const { data: profileRow, error } = await supabaseClient
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') return '';

  return createMemberAvatarSignedUrl(supabaseClient, userId, profileRow?.avatar_url, expiresInSeconds);
};
