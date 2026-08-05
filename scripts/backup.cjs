const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testMovies() {
  const { data, error, count } = await supabase
    .from('movies')
    .select('*', { count: 'exact' });

  console.log('Error:', error);
  console.log('Count from response:', count);
  console.log('Data length:', data ? data.length : 0);
  if (data && data.length > 0) {
    console.log('First ID:', data[0].id);
    console.log('Last ID:', data[data.length - 1].id);
  }
}

testMovies();
