function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function createFrenchBillingProfile() {
    const firstNames = [
        'Camille', 'Louis', 'Emma', 'Gabriel', 'Jules', 'Lina',
        'Arthur', 'Manon', 'Hugo', 'Chloe', 'Lucas', 'Lea'
    ];
    const lastNames = [
        'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard',
        'Petit', 'Durand', 'Moreau', 'Laurent', 'Simon', 'Michel'
    ];
    const streets = [
        'Rue de la Paix', 'Rue de Rivoli', 'Avenue des Champs-Elysees',
        'Boulevard Saint-Germain', 'Rue du Bac', 'Rue de Vaugirard',
        'Avenue Victor Hugo', 'Rue du Faubourg Saint-Honore',
        'Boulevard Haussmann', 'Rue de la Convention'
    ];
    const cities = [
        { name: 'Paris', postalBase: 75000 },
        { name: 'Lyon', postalBase: 69000 },
        { name: 'Marseille', postalBase: 13000 },
        { name: 'Bordeaux', postalBase: 33000 },
        { name: 'Toulouse', postalBase: 31000 },
        { name: 'Nantes', postalBase: 44000 },
        { name: 'Strasbourg', postalBase: 67000 },
        { name: 'Lille', postalBase: 59000 }
    ];

    const city = pickRandom(cities);
    const firstName = pickRandom(firstNames);
    const lastName = pickRandom(lastNames);
    const street = pickRandom(streets);
    const buildingNumber = Math.floor(Math.random() * 180) + 1;
    const postalCode = String(city.postalBase + Math.floor(Math.random() * 20)).padStart(5, '0');

    return {
        name: `${firstName} ${lastName}`,
        street: `${buildingNumber} ${street}`,
        postalCode,
        city: city.name,
        countryCode: 'FR',
        countryName: 'France'
    };
}

module.exports = {
    createFrenchBillingProfile
};
