/**
 * Indian city dictionary used to normalise free-text locations.
 * Key: canonical city name (current official/common English spelling).
 * Aliases are matched case-insensitively as whole words.
 */
export interface CityEntry {
  city: string;
  state: string;
  aliases: string[];
}

export const INDIAN_CITIES: CityEntry[] = [
  { city: 'Bengaluru', state: 'Karnataka', aliases: ['bangalore', 'bengaluru', 'banglore', 'blr', 'bangaluru', 'bengalore'] },
  { city: 'Mumbai', state: 'Maharashtra', aliases: ['mumbai', 'bombay', 'navi mumbai', 'thane', 'powai', 'andheri', 'bkc'] },
  { city: 'Pune', state: 'Maharashtra', aliases: ['pune', 'poona', 'hinjewadi', 'kharadi'] },
  { city: 'Hyderabad', state: 'Telangana', aliases: ['hyderabad', 'hyderbad', 'secunderabad', 'hyd', 'hitec city', 'gachibowli'] },
  { city: 'Chennai', state: 'Tamil Nadu', aliases: ['chennai', 'madras'] },
  { city: 'New Delhi', state: 'Delhi', aliases: ['new delhi', 'delhi', 'delhi ncr', 'ncr'] },
  { city: 'Gurugram', state: 'Haryana', aliases: ['gurugram', 'gurgaon', 'gurgram'] },
  { city: 'Noida', state: 'Uttar Pradesh', aliases: ['noida', 'greater noida'] },
  { city: 'Kolkata', state: 'West Bengal', aliases: ['kolkata', 'calcutta'] },
  { city: 'Ahmedabad', state: 'Gujarat', aliases: ['ahmedabad', 'amdavad'] },
  { city: 'Gandhinagar', state: 'Gujarat', aliases: ['gandhinagar', 'gift city'] },
  { city: 'Jaipur', state: 'Rajasthan', aliases: ['jaipur'] },
  { city: 'Kochi', state: 'Kerala', aliases: ['kochi', 'cochin', 'ernakulam'] },
  { city: 'Thiruvananthapuram', state: 'Kerala', aliases: ['thiruvananthapuram', 'trivandrum'] },
  { city: 'Coimbatore', state: 'Tamil Nadu', aliases: ['coimbatore'] },
  { city: 'Chandigarh', state: 'Chandigarh', aliases: ['chandigarh', 'mohali'] },
  { city: 'Indore', state: 'Madhya Pradesh', aliases: ['indore'] },
  { city: 'Bhubaneswar', state: 'Odisha', aliases: ['bhubaneswar', 'bhubaneshwar'] },
  { city: 'Lucknow', state: 'Uttar Pradesh', aliases: ['lucknow'] },
  { city: 'Nagpur', state: 'Maharashtra', aliases: ['nagpur'] },
  { city: 'Mysuru', state: 'Karnataka', aliases: ['mysuru', 'mysore'] },
  { city: 'Mangaluru', state: 'Karnataka', aliases: ['mangaluru', 'mangalore'] },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', aliases: ['visakhapatnam', 'vizag'] },
  { city: 'Vadodara', state: 'Gujarat', aliases: ['vadodara', 'baroda'] },
  { city: 'Surat', state: 'Gujarat', aliases: ['surat'] },
  { city: 'Goa', state: 'Goa', aliases: ['goa', 'panaji'] },
  { city: 'Dehradun', state: 'Uttarakhand', aliases: ['dehradun'] },
  { city: 'Bhopal', state: 'Madhya Pradesh', aliases: ['bhopal'] },
  { city: 'Patna', state: 'Bihar', aliases: ['patna'] },
  { city: 'Guwahati', state: 'Assam', aliases: ['guwahati'] },
  { city: 'Vijayawada', state: 'Andhra Pradesh', aliases: ['vijayawada'] },
  { city: 'Madurai', state: 'Tamil Nadu', aliases: ['madurai'] },
  { city: 'Nashik', state: 'Maharashtra', aliases: ['nashik'] },
  { city: 'Faridabad', state: 'Haryana', aliases: ['faridabad'] },
  { city: 'Ghaziabad', state: 'Uttar Pradesh', aliases: ['ghaziabad'] },
  { city: 'Kanpur', state: 'Uttar Pradesh', aliases: ['kanpur'] },
  { city: 'Varanasi', state: 'Uttar Pradesh', aliases: ['varanasi', 'banaras', 'benares'] },
  { city: 'Prayagraj', state: 'Uttar Pradesh', aliases: ['prayagraj', 'allahabad'] },
  { city: 'Ludhiana', state: 'Punjab', aliases: ['ludhiana'] },
  { city: 'Amritsar', state: 'Punjab', aliases: ['amritsar'] },
  { city: 'Raipur', state: 'Chhattisgarh', aliases: ['raipur'] },
  { city: 'Ranchi', state: 'Jharkhand', aliases: ['ranchi'] },
  { city: 'Udaipur', state: 'Rajasthan', aliases: ['udaipur'] },
  { city: 'Jodhpur', state: 'Rajasthan', aliases: ['jodhpur'] },
  { city: 'Tiruchirappalli', state: 'Tamil Nadu', aliases: ['tiruchirappalli', 'trichy'] },
  { city: 'Vellore', state: 'Tamil Nadu', aliases: ['vellore'] },
  { city: 'Warangal', state: 'Telangana', aliases: ['warangal'] },
  { city: 'Hubballi', state: 'Karnataka', aliases: ['hubballi', 'hubli'] },
];

export const INDIAN_STATES: { state: string; aliases: string[] }[] = [
  { state: 'Karnataka', aliases: ['karnataka', 'ka'] },
  { state: 'Maharashtra', aliases: ['maharashtra', 'mh'] },
  { state: 'Telangana', aliases: ['telangana', 'ts', 'tg'] },
  { state: 'Tamil Nadu', aliases: ['tamil nadu', 'tamilnadu', 'tn'] },
  { state: 'Delhi', aliases: ['delhi', 'dl'] },
  { state: 'Haryana', aliases: ['haryana', 'hr'] },
  { state: 'Uttar Pradesh', aliases: ['uttar pradesh', 'up'] },
  { state: 'West Bengal', aliases: ['west bengal', 'wb'] },
  { state: 'Gujarat', aliases: ['gujarat', 'gj'] },
  { state: 'Rajasthan', aliases: ['rajasthan'] },
  { state: 'Kerala', aliases: ['kerala', 'kl'] },
  { state: 'Madhya Pradesh', aliases: ['madhya pradesh', 'mp'] },
  { state: 'Odisha', aliases: ['odisha', 'orissa'] },
  { state: 'Andhra Pradesh', aliases: ['andhra pradesh', 'ap'] },
  { state: 'Punjab', aliases: ['punjab'] },
  { state: 'Goa', aliases: ['goa'] },
  { state: 'Assam', aliases: ['assam'] },
  { state: 'Bihar', aliases: ['bihar'] },
  { state: 'Uttarakhand', aliases: ['uttarakhand', 'uttrakhand'] },
  { state: 'Chandigarh', aliases: ['chandigarh'] },
  { state: 'Chhattisgarh', aliases: ['chhattisgarh'] },
  { state: 'Jharkhand', aliases: ['jharkhand'] },
  { state: 'Himachal Pradesh', aliases: ['himachal pradesh'] },
  { state: 'Jammu and Kashmir', aliases: ['jammu and kashmir', 'jammu & kashmir'] },
];

/** Two-letter state codes collide with US/Canadian ones ("Lafayette, IN", "Nashville, TN").
 *  They are honoured only as a standalone component of a segment that also names India. */
export const AMBIGUOUS_STATE_ALIASES = new Set(['ka', 'mh', 'ts', 'tg', 'tn', 'dl', 'hr', 'up', 'wb', 'gj', 'kl', 'mp', 'ap']);
