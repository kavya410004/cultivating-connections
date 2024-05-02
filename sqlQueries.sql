CREATE TABLE farmers(
	farmer_id SERIAL,
	name_ VARCHAR(100) NOT NULL,
	phone_number VARCHAR(10) PRIMARY KEY NOT NULL CHECK (phone_number ~ '^\d{10}$'),
	district VARCHAR(100) NOT NULL,
	farmer_password TEXT NOT NULL
);


CREATE TABLE buyers(
	buyer_id SERIAL,
	name_ VARCHAR(100) NOT NULL,
	phone_number VARCHAR(10) PRIMARY KEY NOT NULL CHECK (phone_number ~ '^\d{10}$'),
	buyer_password TEXT NOT NULL
);

CREATE TABLE crops(
	crop_id SERIAL PRIMARY KEY,
	crop_name VARCHAR(50) NOT NULL,
	crop_price NUMERIC NOT NULL,
	crop_quantity NUMERIC NOT NULL,
	crop_listed_on DATE NOT NULL,
	farmer_phone_number VARCHAR(10) NOT NULL REFERENCES farmers(phone_number) NOT NULL,
	crop_image_path TEXT
);

CREATE TABLE requests(
	request_id SERIAL PRIMARY KEY,
	request_quantity NUMERIC NOT NULL,
	request_status VARCHAR(1) DEFAULT 'P',
	buyer_phone_number VARCHAR(10) REFERENCES buyers(phone_number) NOT NULL,
	crop_id INTEGER NOT NULL REFERENCES crops(crop_id)
);