// The sky's brightest stars and their constellation figures, shared by the Timechain Sphere's planetarium and the
// Ember Den's birth-sky window. Plain data.
(() => {
  "use strict";
  const BL = window.BL;
  // The brightest stars by name: right ascension (hours), declination (degrees), visual magnitude and colour.
  const STARS = Object.freeze([
    ["Sirius", 6.7525, -16.716, -1.46, "w"], ["Canopus", 6.3992, -52.696, -0.74, "w"], ["Arcturus", 14.261, 19.182, -0.05, "o"], ["Rigil Kentaurus", 14.66, -60.834, -0.27, "y"],
    ["Vega", 18.6156, 38.784, 0.03, "b"], ["Capella", 5.2782, 45.998, 0.08, "y"], ["Rigel", 5.2423, -8.202, 0.13, "b"], ["Procyon", 7.655, 5.225, 0.34, "w"],
    ["Achernar", 1.6286, -57.237, 0.46, "b"], ["Betelgeuse", 5.9195, 7.407, 0.5, "r"], ["Hadar", 14.0637, -60.373, 0.61, "b"], ["Altair", 19.8464, 8.868, 0.76, "w"],
    ["Acrux", 12.4433, -63.099, 0.77, "b"], ["Aldebaran", 4.5987, 16.509, 0.86, "r"], ["Antares", 16.4901, -26.432, 0.96, "r"], ["Spica", 13.4199, -11.161, 0.97, "b"],
    ["Pollux", 7.7553, 28.026, 1.14, "o"], ["Fomalhaut", 22.9608, -29.622, 1.16, "w"], ["Deneb", 20.6905, 45.28, 1.25, "w"], ["Mimosa", 12.7953, -59.689, 1.25, "b"],
    ["Regulus", 10.1395, 11.967, 1.35, "b"], ["Adhara", 6.9771, -28.972, 1.5, "b"], ["Castor", 7.5767, 31.888, 1.58, "w"], ["Shaula", 17.5601, -37.104, 1.62, "b"],
    ["Gacrux", 12.5194, -57.113, 1.64, "r"], ["Bellatrix", 5.4189, 6.35, 1.64, "b"], ["Elnath", 5.4382, 28.608, 1.65, "b"], ["Alnilam", 5.6036, -1.202, 1.69, "b"],
    ["Alnitak", 5.6793, -1.943, 1.77, "b"], ["Alioth", 12.9005, 55.96, 1.77, "w"], ["Dubhe", 11.0621, 61.751, 1.79, "o"], ["Mirfak", 3.4054, 49.861, 1.79, "y"],
    ["Alkaid", 13.7923, 49.313, 1.86, "b"], ["Sargas", 17.622, -42.998, 1.86, "y"], ["Alhena", 6.6285, 16.399, 1.93, "w"], ["Polaris", 2.5302, 89.264, 1.98, "y"],
    ["Hamal", 2.1195, 23.463, 2.0, "o"], ["Mirach", 1.1622, 35.621, 2.05, "r"], ["Alpheratz", 0.1398, 29.091, 2.06, "b"], ["Kochab", 14.8451, 74.155, 2.08, "o"],
    ["Algieba", 10.3329, 19.842, 2.08, "o"], ["Saiph", 5.7959, -9.67, 2.09, "b"], ["Almach", 2.065, 42.33, 2.1, "o"], ["Algol", 3.1361, 40.956, 2.12, "b"],
    ["Denebola", 11.8177, 14.572, 2.14, "w"], ["Gamma Cas", 0.9451, 60.717, 2.15, "b"], ["Mintaka", 5.5334, -0.299, 2.23, "b"], ["Mizar", 13.3988, 54.925, 2.23, "w"],
    ["Sadr", 20.3705, 40.257, 2.23, "y"], ["Schedar", 0.6751, 56.537, 2.24, "o"], ["Caph", 0.153, 59.15, 2.28, "w"], ["Dschubba", 16.0056, -22.622, 2.29, "b"],
    ["Epsilon Sco", 16.8361, -34.293, 2.29, "o"], ["Merak", 11.0307, 56.382, 2.37, "w"], ["Kappa Sco", 17.7081, -39.03, 2.41, "b"], ["Scheat", 23.0629, 28.083, 2.42, "r"],
    ["Phecda", 11.8972, 53.695, 2.44, "w"], ["Gienah", 20.7702, 33.97, 2.48, "o"], ["Markab", 23.0793, 15.205, 2.48, "b"], ["Zosma", 11.2351, 20.524, 2.56, "w"],
    ["Acrab", 16.0906, -19.806, 2.62, "b"], ["Ruchbah", 1.4303, 60.235, 2.66, "w"], ["Lesath", 17.5127, -37.296, 2.7, "b"], ["Delta Cru", 12.2524, -58.749, 2.79, "b"],
    ["Tau Sco", 16.598, -28.216, 2.82, "b"], ["Algenib", 0.2206, 15.184, 2.83, "b"], ["Alcyone", 3.7914, 24.105, 2.87, "b"], ["Delta Cyg", 19.7496, 45.131, 2.87, "b"],
    ["Pi Sco", 15.9809, -26.114, 2.89, "b"], ["Sigma Sco", 16.3531, -25.593, 2.89, "b"], ["Ras Elased", 9.7642, 23.774, 2.98, "o"], ["Pherkad", 15.3455, 71.834, 3.0, "w"],
    ["Iota Sco", 17.793, -40.127, 3.0, "y"], ["Mu Sco", 16.8645, -38.047, 3.0, "b"], ["Albireo", 19.5121, 27.96, 3.08, "o"], ["Eta Sco", 17.2025, -43.239, 3.3, "w"],
    ["Megrez", 12.2571, 57.033, 3.31, "w"], ["Chertan", 11.2373, 15.43, 3.33, "w"], ["Segin", 1.9066, 63.67, 3.35, "b"], ["Meissa", 5.5856, 9.934, 3.39, "b"],
    ["Adhafera", 10.2782, 23.417, 3.43, "w"], ["Eta Leo", 10.1222, 16.763, 3.49, "w"], ["Zeta Sco", 16.9097, -42.362, 3.6, "o"], ["Atlas", 3.8194, 24.053, 3.62, "b"],
    ["Electra", 3.7479, 24.113, 3.7, "b"], ["Maia", 3.7638, 24.368, 3.87, "b"], ["Merope", 3.7721, 23.948, 4.18, "b"], ["Taygeta", 3.7535, 24.467, 4.3, "b"]
  ]);
  // The constellation figures, star to star, and the names hung under (or over) a star, `dy` 7 cm steps along the sky.
  const FIGURES = Object.freeze([
    ["Betelgeuse", "Meissa"], ["Meissa", "Bellatrix"], ["Betelgeuse", "Bellatrix"], ["Betelgeuse", "Alnitak"], ["Bellatrix", "Mintaka"], ["Alnitak", "Alnilam"], ["Alnilam", "Mintaka"], ["Alnitak", "Saiph"], ["Mintaka", "Rigel"],
    ["Dubhe", "Merak"], ["Merak", "Phecda"], ["Phecda", "Megrez"], ["Megrez", "Dubhe"], ["Megrez", "Alioth"], ["Alioth", "Mizar"], ["Mizar", "Alkaid"],
    ["Caph", "Schedar"], ["Schedar", "Gamma Cas"], ["Gamma Cas", "Ruchbah"], ["Ruchbah", "Segin"],
    ["Deneb", "Sadr"], ["Sadr", "Albireo"], ["Gienah", "Sadr"], ["Sadr", "Delta Cyg"],
    ["Regulus", "Eta Leo"], ["Eta Leo", "Algieba"], ["Algieba", "Adhafera"], ["Adhafera", "Ras Elased"], ["Algieba", "Zosma"], ["Zosma", "Denebola"], ["Denebola", "Chertan"], ["Chertan", "Regulus"], ["Zosma", "Chertan"],
    ["Acrab", "Dschubba"], ["Dschubba", "Pi Sco"], ["Dschubba", "Sigma Sco"], ["Sigma Sco", "Antares"], ["Antares", "Tau Sco"], ["Tau Sco", "Epsilon Sco"], ["Epsilon Sco", "Mu Sco"], ["Mu Sco", "Zeta Sco"], ["Zeta Sco", "Eta Sco"], ["Eta Sco", "Sargas"], ["Sargas", "Iota Sco"], ["Iota Sco", "Kappa Sco"], ["Kappa Sco", "Shaula"], ["Shaula", "Lesath"],
    ["Acrux", "Gacrux"], ["Mimosa", "Delta Cru"], ["Kochab", "Pherkad"],
    ["Markab", "Scheat"], ["Scheat", "Alpheratz"], ["Alpheratz", "Algenib"], ["Algenib", "Markab"], ["Alpheratz", "Mirach"], ["Mirach", "Almach"],
    ["Castor", "Pollux"], ["Vega", "Deneb"], ["Deneb", "Altair"], ["Altair", "Vega"]
  ]);
  BL.skyCatalog = Object.freeze({ STARS, FIGURES });
})();
