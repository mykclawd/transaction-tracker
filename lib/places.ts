// Google Places API integration for merchant categorization

interface PlaceResult {
  name: string;
  types: string[];
  formatted_address?: string;
}

// Map Google Places types to our categories
const PLACE_TYPE_TO_CATEGORY: Record<string, string> = {
  // Food & Dining
  'restaurant': 'Food & Dining',
  'cafe': 'Food & Dining',
  'bakery': 'Food & Dining',
  'bar': 'Food & Dining',
  'meal_delivery': 'Food & Dining',
  'meal_takeaway': 'Food & Dining',
  'food': 'Food & Dining',
  
  // Shopping
  'store': 'Shopping',
  'supermarket': 'Shopping',
  'grocery_or_supermarket': 'Shopping',
  'shopping_mall': 'Shopping',
  'clothing_store': 'Shopping',
  'department_store': 'Shopping',
  'electronics_store': 'Shopping',
  'home_goods_store': 'Shopping',
  'jewelry_store': 'Shopping',
  'shoe_store': 'Shopping',
  'convenience_store': 'Shopping',
  'liquor_store': 'Shopping',
  'pet_store': 'Shopping',
  'pharmacy': 'Shopping',
  
  // Entertainment
  'movie_theater': 'Entertainment',
  'bowling_alley': 'Entertainment',
  'casino': 'Entertainment',
  'night_club': 'Entertainment',
  'amusement_park': 'Entertainment',
  'aquarium': 'Entertainment',
  'museum': 'Entertainment',
  'tourist_attraction': 'Entertainment',
  'zoo': 'Entertainment',
  'stadium': 'Entertainment',
  
  // Transportation
  'gas_station': 'Transportation',
  'parking': 'Transportation',
  'car_repair': 'Transportation',
  'car_dealer': 'Transportation',
  'car_rental': 'Transportation',
  'car_wash': 'Transportation',
  'taxi_stand': 'Transportation',
  'transit_station': 'Transportation',
  'subway_station': 'Transportation',
  'train_station': 'Transportation',
  'bus_station': 'Transportation',
  'airport': 'Transportation',
  
  // Travel
  'lodging': 'Travel',
  'hotel': 'Travel',
  'travel_agency': 'Travel',
  'campground': 'Travel',
  'rv_park': 'Travel',
  
  // Utilities
  'electrician': 'Utilities',
  'plumber': 'Utilities',
  'roofing_contractor': 'Utilities',
  'general_contractor': 'Utilities',
  
  // Healthcare
  'doctor': 'Healthcare',
  'dentist': 'Healthcare',
  'hospital': 'Healthcare',
  'physiotherapist': 'Healthcare',
  'veterinary_care': 'Healthcare',
  'health': 'Healthcare',
  'medical': 'Healthcare',
  
  // Education
  'school': 'Education',
  'university': 'Education',
  'library': 'Education',
  'book_store': 'Education',
  
  // Business
  'bank': 'Business',
  'atm': 'Business',
  'accounting': 'Business',
  'insurance_agency': 'Business',
  'lawyer': 'Business',
  'real_estate_agency': 'Business',
  'post_office': 'Business',
  'courthouse': 'Business',
  'embassy': 'Business',
  'local_government_office': 'Business',
  'police': 'Business',
  'fire_station': 'Business',
  
  // Other mappings
  'gym': 'Entertainment',
  'spa': 'Entertainment',
  'beauty_salon': 'Shopping',
  'hair_care': 'Shopping',
  'laundry': 'Shopping',
  'dry_cleaning': 'Shopping',
  'florist': 'Shopping',
  'furniture_store': 'Shopping',
  'hardware_store': 'Shopping',
  'moving_company': 'Utilities',
  'storage': 'Utilities',
};

export async function categorizeMerchant(merchantName: string, apiKey: string): Promise<string | null> {
  try {
    // Search for the place using Google Places API
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(merchantName)}&key=${apiKey}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (searchData.status !== 'OK' || !searchData.results || searchData.results.length === 0) {
      console.log(`No Places result for: ${merchantName}`);
      return null;
    }
    
    // Get the first result's types
    const place = searchData.results[0];
    const types = place.types || [];
    
    // Map the first matching type to our category
    for (const type of types) {
      const category = PLACE_TYPE_TO_CATEGORY[type];
      if (category) {
        console.log(`Categorized "${merchantName}" as "${category}" (type: ${type})`);
        return category;
      }
    }
    
    console.log(`No category mapping for types: ${types.join(', ')}`);
    return null;
  } catch (error) {
    console.error('Error categorizing merchant:', error);
    return null;
  }
}

// Common merchant name mappings (for cases where Places API doesn't find it)
const COMMON_MERCHANT_MAPPINGS: Record<string, string> = {
  'amazon': 'Shopping',
  'uber eats': 'Food & Dining',
  'doordash': 'Food & Dining',
  'grubhub': 'Food & Dining',
  'postmates': 'Food & Dining',
  'instacart': 'Shopping',
  'netflix': 'Entertainment',
  'spotify': 'Entertainment',
  'hulu': 'Entertainment',
  'disney': 'Entertainment',
  'apple': 'Shopping',
  'google': 'Business',
  'microsoft': 'Business',
  'shell': 'Transportation',
  'bp': 'Transportation',
  'chevron': 'Transportation',
  'exxon': 'Transportation',
  'mobil': 'Transportation',
  'costco': 'Shopping',
  'walmart': 'Shopping',
  'target': 'Shopping',
  'walgreens': 'Shopping',
  'cvs': 'Shopping',
  'starbucks': 'Food & Dining',
  'mcdonald': 'Food & Dining',
  'chipotle': 'Food & Dining',
  'subway': 'Food & Dining',
  'chick-fil-a': 'Food & Dining',
  'uber': 'Transportation',
  'lyft': 'Transportation',
  'airbnb': 'Travel',
  'marriott': 'Travel',
  'hilton': 'Travel',
  'delta': 'Travel',
  'united': 'Travel',
  'american airlines': 'Travel',
  'southwest': 'Travel',
};

export function categorizeByCommonName(merchantName: string): string | null {
  const lowerName = merchantName.toLowerCase();
  
  for (const [keyword, category] of Object.entries(COMMON_MERCHANT_MAPPINGS)) {
    if (lowerName.includes(keyword)) {
      console.log(`Categorized "${merchantName}" as "${category}" (common name match)`);
      return category;
    }
  }
  
  return null;
}

export async function getMerchantCategory(merchantName: string, apiKey: string): Promise<string | null> {
  // Try common name mapping first (faster, no API call)
  const commonCategory = categorizeByCommonName(merchantName);
  if (commonCategory) {
    return commonCategory;
  }
  
  // Fall back to Google Places API
  return categorizeMerchant(merchantName, apiKey);
}
