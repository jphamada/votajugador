// CONFIGURACIÓN DE CONEXIÓN CON SUPABASE
// Reemplaza los siguientes valores con las credenciales de tu proyecto de Supabase
// Puedes encontrar estos valores en: Settings -> API de tu panel de Supabase.

const SUPABASE_URL = "https://unwxalpnlcrhgdohraet.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud3hhbHBubGNyaGdkb2hyYWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTk0MjQsImV4cCI6MjA5OTAzNTQyNH0.n_3QfhNDx_eeJwb9-BWtmW3sbMCBt2tIzg7vUQfMNS0";

// Si dejas las variables vacías (""), la aplicación entrará automáticamente en 
// modo "Local Fallback" utilizando localStorage para almacenar partidos y votos.
// Esto te permite probar toda la funcionalidad de manera local sin configurar la base de datos de inmediato.
