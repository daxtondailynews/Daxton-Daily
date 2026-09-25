/* Fixed list of the 45 supported cities (12 Canada + 33 US).
 * slug = used in the URL/localStorage
 * name = display name and the key used to look up content.local[name]
 * hasContent = true for the handful of cities with fully-written demo
 *   content in the Supabase editions table. Everything else renders a graceful
 *   "not available yet" fallback on the reading page. This flag mirrors
 *   how city coverage will actually roll out gradually in production.
 */
window.CITIES = [
  { name: "Toronto", slug: "toronto", country: "CA", hasContent: true },
  { name: "Vancouver", slug: "vancouver", country: "CA", hasContent: true },
  { name: "Montreal", slug: "montreal", country: "CA", hasContent: false },
  { name: "Calgary", slug: "calgary", country: "CA", hasContent: false },
  { name: "Ottawa", slug: "ottawa", country: "CA", hasContent: false },
  { name: "Edmonton", slug: "edmonton", country: "CA", hasContent: false },
  { name: "Winnipeg", slug: "winnipeg", country: "CA", hasContent: false },
  { name: "Quebec City", slug: "quebec-city", country: "CA", hasContent: false },
  { name: "Hamilton", slug: "hamilton", country: "CA", hasContent: false },
  { name: "Kitchener-Waterloo", slug: "kitchener-waterloo", country: "CA", hasContent: false },
  { name: "London", slug: "london", country: "CA", hasContent: false },
  { name: "Halifax", slug: "halifax", country: "CA", hasContent: false },
  { name: "New York City", slug: "new-york-city", country: "US", hasContent: true },
  { name: "Los Angeles", slug: "los-angeles", country: "US", hasContent: false },
  { name: "Chicago", slug: "chicago", country: "US", hasContent: true },
  { name: "Houston", slug: "houston", country: "US", hasContent: false },
  { name: "Dallas", slug: "dallas", country: "US", hasContent: true },
  { name: "Phoenix", slug: "phoenix", country: "US", hasContent: false },
  { name: "Philadelphia", slug: "philadelphia", country: "US", hasContent: false },
  { name: "San Antonio", slug: "san-antonio", country: "US", hasContent: false },
  { name: "San Diego", slug: "san-diego", country: "US", hasContent: false },
  { name: "Austin", slug: "austin", country: "US", hasContent: false },
  { name: "Seattle", slug: "seattle", country: "US", hasContent: false },
  { name: "Denver", slug: "denver", country: "US", hasContent: false },
  { name: "Boston", slug: "boston", country: "US", hasContent: false },
  { name: "Miami", slug: "miami", country: "US", hasContent: false },
  { name: "Atlanta", slug: "atlanta", country: "US", hasContent: false },
  { name: "Washington D.C.", slug: "washington-dc", country: "US", hasContent: false },
  { name: "San Francisco", slug: "san-francisco", country: "US", hasContent: false },
  { name: "Las Vegas", slug: "las-vegas", country: "US", hasContent: false },
  { name: "Nashville", slug: "nashville", country: "US", hasContent: false },
  { name: "New Orleans", slug: "new-orleans", country: "US", hasContent: false },
  { name: "Portland", slug: "portland", country: "US", hasContent: false },
  { name: "Charlotte", slug: "charlotte", country: "US", hasContent: false },
  { name: "Minneapolis", slug: "minneapolis", country: "US", hasContent: false },
  { name: "San Jose", slug: "san-jose", country: "US", hasContent: false },
  { name: "Detroit", slug: "detroit", country: "US", hasContent: false },
  { name: "Baltimore", slug: "baltimore", country: "US", hasContent: false },
  { name: "Milwaukee", slug: "milwaukee", country: "US", hasContent: false },
  { name: "Tampa", slug: "tampa", country: "US", hasContent: false },
  { name: "Orlando", slug: "orlando", country: "US", hasContent: false },
  { name: "Sacramento", slug: "sacramento", country: "US", hasContent: false },
  { name: "Kansas City", slug: "kansas-city", country: "US", hasContent: false },
  { name: "Cleveland", slug: "cleveland", country: "US", hasContent: false },
  { name: "Pittsburgh", slug: "pittsburgh", country: "US", hasContent: false }
];
