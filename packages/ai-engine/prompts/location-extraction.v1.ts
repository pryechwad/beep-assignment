export const version = 'location.v1';

export const instructions = `LOCATION & WORK MODE
- location.type: CITY (one Indian city), STATE (only a state is named), REMOTE (remote with no city), MULTIPLE (several cities), UNKNOWN.
- location.city: the primary Indian city using its current official name (Bengaluru, Mumbai, Gurugram, New Delhi, Chennai, Kolkata...). null if none is stated.
- location.state: the Indian state of that city, or the state named. null if unknown.
- Use the structured "Source locations" field first. Never invent a city that is not stated.
- work_mode: ONSITE, HYBRID or REMOTE only if stated; otherwise null.
- employment_type: FULL_TIME, INTERNSHIP, PART_TIME, CONTRACT or FREELANCE only if stated or the title says so; otherwise null.`;
