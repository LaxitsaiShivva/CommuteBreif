
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lrasgqaacvmhlpozqldt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYXNncWFhY3ZtaGxwb3pxbGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MzM0NzksImV4cCI6MjA4NTAwOTQ3OX0.qCV_mdf7GmFE-mMUtcQTP9cXQcg6ih9RLv08ZtF0JSY';

export const supabase = createClient(supabaseUrl, supabaseKey);
