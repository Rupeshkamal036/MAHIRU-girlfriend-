import { resolveWebsiteUrl } from './src/audio/LiveSession';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✔ PASSED: ${msg}`);
}

console.log('======================================================');
console.log('MAHIRU STEP 2: INSTAGRAM ID & PROFILE SEARCH VERIFICATION');
console.log('======================================================');

// TEST 1: "Instagram open karo"
{
  const result = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
  });
  console.log('TEST 1 Result:', result);
  assert(result === 'https://www.instagram.com/', 'Test 1: Instagram opens default home page without query');
}

// TEST 2: "Instagram open karo aur @username search karo" / "@rupeshkamal"
{
  const resultAtUser = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
    searchQuery: '@username',
  });
  console.log('TEST 2 (@username) Result:', resultAtUser);
  assert(resultAtUser === 'https://www.instagram.com/username/', 'Test 2: @username resolves to exact profile url');

  const resultAtRupesh = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
    searchQuery: '@rupeshkamal',
  });
  console.log('TEST 2 (@rupeshkamal) Result:', resultAtRupesh);
  assert(resultAtRupesh === 'https://www.instagram.com/rupeshkamal/', 'Test 2: @rupeshkamal resolves to exact profile url');
}

// TEST 3: "Instagram open karo aur rupeshkamal search karo"
{
  const result = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
    searchQuery: 'rupeshkamal',
  });
  console.log('TEST 3 Result:', result);
  assert(result === 'https://www.instagram.com/rupeshkamal/', 'Test 3: rupeshkamal handle resolves to exact profile url');
}

// TEST 4: "Instagram open karo aur Rupesh Kamal search karo"
// Person's name with spaces - DO NOT INVENT USERNAME "rupeshkamal"
{
  const result = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
    searchQuery: 'Rupesh Kamal',
  });
  console.log('TEST 4 (Person Name) Result:', result);
  assert(
    result === 'https://www.instagram.com/explore/search/keyword/?q=Rupesh%20Kamal',
    'Test 4: Rupesh Kamal performs keyword search without inventing a username'
  );

  const resultWithSuffix = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
    searchQuery: 'Rupesh Kamal ka ID search karo',
  });
  console.log('TEST 4 (With ka ID search karo) Result:', resultWithSuffix);
  assert(
    resultWithSuffix === 'https://www.instagram.com/explore/search/keyword/?q=Rupesh%20Kamal',
    'Test 4: Conversational suffix trimmed, performs keyword search for Rupesh Kamal'
  );
}

// TEST 5: "Instagram open karo aur xyz123 search karo"
{
  const result = resolveWebsiteUrl({
    url: 'https://www.instagram.com',
    siteName: 'Instagram',
    searchQuery: 'xyz123',
  });
  console.log('TEST 5 Result:', result);
  assert(result === 'https://www.instagram.com/xyz123/', 'Test 5: xyz123 is correctly passed as Instagram target handle');
}

// TEST 6: Verify existing searches still work unchanged
{
  const google = resolveWebsiteUrl({
    url: 'https://www.google.com/search?q=weather',
    siteName: 'Google',
  });
  assert(google === 'https://www.google.com/search?q=weather', 'Test 6: Google search works unchanged');

  const facebook = resolveWebsiteUrl({
    url: 'https://www.facebook.com/search/top/?q=Rupesh',
    siteName: 'Facebook',
  });
  assert(facebook === 'https://www.facebook.com/search/top/?q=Rupesh', 'Test 6: Facebook search works unchanged');

  const youtube = resolveWebsiteUrl({
    url: 'https://www.youtube.com/results?search_query=songs',
    siteName: 'YouTube',
  });
  assert(youtube === 'https://www.youtube.com/results?search_query=songs', 'Test 6: YouTube search works unchanged');

  const flipkart = resolveWebsiteUrl({
    url: 'https://www.flipkart.com/search?q=shoes',
    siteName: 'Flipkart',
  });
  assert(flipkart === 'https://www.flipkart.com/search?q=shoes', 'Test 6: Flipkart search works unchanged');

  const maps = resolveWebsiteUrl({
    url: 'https://www.google.com/maps/search/cafe',
    siteName: 'Google Maps',
  });
  assert(maps === 'https://www.google.com/maps/search/cafe', 'Test 6: Google Maps search works unchanged');
}

console.log('======================================================');
console.log('ALL STEP 2 INSTAGRAM & EXISTING SEARCH TESTS PASSED! ✔');
console.log('======================================================');
