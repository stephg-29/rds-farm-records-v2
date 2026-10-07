// ============================================================
// Farm Records: this farm's connection details.
//
// Copy this file to config.js and fill in the farm's own Supabase
// project (Supabase dashboard > Project Settings > API).
// Use the PUBLISHABLE key (sb_publishable_...). It is designed to be
// public; the database's access rules protect the data.
// NEVER put the secret or service_role key here.
// ============================================================
window.FARM_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabasePublishableKey: 'sb_publishable_...',
  // Optional: national aerial imagery (ArcGIS Location Platform API key,
  // restricted to this farm's web address). Without it, NSW and Queensland
  // get free state imagery and everywhere gets the national base map.
  // esriApiKey: 'AAPT...',
};
