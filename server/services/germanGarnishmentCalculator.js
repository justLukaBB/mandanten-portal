/**
 * German Garnishment Calculator Service
 * Implements German garnishment table (Pfändungstabelle) based on official rates
 * Integrates with Phase 1 creditor response data for debt restructuring planning
 */
class GermanGarnishmentCalculator {
    constructor() {
        console.log('🇩🇪 Initializing German Garnishment Calculator...');
        
        // German garnishment table 2025-2026 (valid July 1, 2025 - June 30, 2026)
        // Complete official table - Format: [income_threshold, [0_dep, 1_dep, 2_dep, 3_dep, 4_dep, 5_dep]]
        this.garnishmentTable2025 = [
            [1559.99, [0.00, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1569.99, [3.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1579.99, [10.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1589.99, [17.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1599.99, [24.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1609.99, [31.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1619.99, [38.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1629.99, [45.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1639.99, [52.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1649.99, [59.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1659.99, [66.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1669.99, [73.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1679.99, [80.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1689.99, [87.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1699.99, [94.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1709.99, [101.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1719.99, [108.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1729.99, [115.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1739.99, [122.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1749.99, [129.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1759.99, [136.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1769.99, [143.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1779.99, [150.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1789.99, [157.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1799.99, [164.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1809.99, [171.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1819.99, [178.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1829.99, [185.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1839.99, [192.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1849.99, [199.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1859.99, [206.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1869.99, [213.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1879.99, [220.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1889.99, [227.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1899.99, [234.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1909.99, [241.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1919.99, [248.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1929.99, [255.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1939.99, [262.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1949.99, [269.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1959.99, [276.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1969.99, [283.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1979.99, [290.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1989.99, [297.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [1999.99, [304.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2009.99, [311.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2019.99, [318.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2029.99, [325.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2039.99, [332.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2049.99, [339.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2059.99, [346.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2069.99, [353.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2079.99, [360.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2089.99, [367.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2099.99, [374.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2109.99, [381.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2119.99, [388.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2129.99, [395.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2139.99, [402.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2149.99, [409.50, 0.00, 0.00, 0.00, 0.00, 0.00]],
            [2159.99, [416.50, 4.89, 0.00, 0.00, 0.00, 0.00]],
            [2169.99, [423.50, 9.89, 0.00, 0.00, 0.00, 0.00]],
            [2179.99, [430.50, 14.89, 0.00, 0.00, 0.00, 0.00]],
            [2189.99, [437.50, 19.89, 0.00, 0.00, 0.00, 0.00]],
            [2199.99, [444.50, 24.89, 0.00, 0.00, 0.00, 0.00]],
            [2209.99, [451.50, 29.89, 0.00, 0.00, 0.00, 0.00]],
            [2219.99, [458.50, 34.89, 0.00, 0.00, 0.00, 0.00]],
            [2229.99, [465.50, 39.89, 0.00, 0.00, 0.00, 0.00]],
            [2239.99, [472.50, 44.89, 0.00, 0.00, 0.00, 0.00]],
            [2249.99, [479.50, 49.89, 0.00, 0.00, 0.00, 0.00]],
            [2259.99, [486.50, 54.89, 0.00, 0.00, 0.00, 0.00]],
            [2269.99, [493.50, 59.89, 0.00, 0.00, 0.00, 0.00]],
            [2279.99, [500.50, 64.89, 0.00, 0.00, 0.00, 0.00]],
            [2289.99, [507.50, 69.89, 0.00, 0.00, 0.00, 0.00]],
            [2299.99, [514.50, 74.89, 0.00, 0.00, 0.00, 0.00]],
            [2309.99, [521.50, 79.89, 0.00, 0.00, 0.00, 0.00]],
            [2319.99, [528.50, 84.89, 0.00, 0.00, 0.00, 0.00]],
            [2329.99, [535.50, 89.89, 0.00, 0.00, 0.00, 0.00]],
            [2339.99, [542.50, 94.89, 0.00, 0.00, 0.00, 0.00]],
            [2349.99, [549.50, 99.89, 0.00, 0.00, 0.00, 0.00]],
            [2359.99, [556.50, 104.89, 0.00, 0.00, 0.00, 0.00]],
            [2369.99, [563.50, 109.89, 0.00, 0.00, 0.00, 0.00]],
            [2379.99, [570.50, 114.89, 0.00, 0.00, 0.00, 0.00]],
            [2389.99, [577.50, 119.89, 0.00, 0.00, 0.00, 0.00]],
            [2399.99, [584.50, 124.89, 0.00, 0.00, 0.00, 0.00]],
            [2409.99, [591.50, 129.89, 0.00, 0.00, 0.00, 0.00]],
            [2419.99, [598.50, 134.89, 0.00, 0.00, 0.00, 0.00]],
            [2429.99, [605.50, 139.89, 0.00, 0.00, 0.00, 0.00]],
            [2439.99, [612.50, 144.89, 0.00, 0.00, 0.00, 0.00]],
            [2449.99, [619.50, 149.89, 0.00, 0.00, 0.00, 0.00]],
            [2459.99, [626.50, 154.89, 0.00, 0.00, 0.00, 0.00]],
            [2469.99, [633.50, 159.89, 0.00, 0.00, 0.00, 0.00]],
            [2479.99, [640.50, 164.89, 1.49, 0.00, 0.00, 0.00]],
            [2489.99, [647.50, 169.89, 5.49, 0.00, 0.00, 0.00]],
            [2499.99, [654.50, 174.89, 9.49, 0.00, 0.00, 0.00]],
            [2509.99, [661.50, 179.89, 13.49, 0.00, 0.00, 0.00]],
            [2519.99, [668.50, 184.89, 17.49, 0.00, 0.00, 0.00]],
            [2529.99, [675.50, 189.89, 21.49, 0.00, 0.00, 0.00]],
            [2539.99, [682.50, 194.89, 25.49, 0.00, 0.00, 0.00]],
            [2549.99, [689.50, 199.89, 29.49, 0.00, 0.00, 0.00]],
            [2559.99, [696.50, 204.89, 33.49, 0.00, 0.00, 0.00]],
            [2569.99, [703.50, 209.89, 37.49, 0.00, 0.00, 0.00]],
            [2579.99, [710.50, 214.89, 41.49, 0.00, 0.00, 0.00]],
            [2589.99, [717.50, 219.89, 45.49, 0.00, 0.00, 0.00]],
            [2599.99, [724.50, 224.89, 49.49, 0.00, 0.00, 0.00]],
            [2609.99, [731.50, 229.89, 53.49, 0.00, 0.00, 0.00]],
            [2619.99, [738.50, 234.89, 57.49, 0.00, 0.00, 0.00]],
            [2629.99, [745.50, 239.89, 61.49, 0.00, 0.00, 0.00]],
            [2639.99, [752.50, 244.89, 65.49, 0.00, 0.00, 0.00]],
            [2649.99, [759.50, 249.89, 69.49, 0.00, 0.00, 0.00]],
            [2659.99, [766.50, 254.89, 73.49, 0.00, 0.00, 0.00]],
            [2669.99, [773.50, 259.89, 77.49, 0.00, 0.00, 0.00]],
            [2679.99, [780.50, 264.89, 81.49, 0.00, 0.00, 0.00]],
            [2689.99, [787.50, 269.89, 85.49, 0.00, 0.00, 0.00]],
            [2699.99, [794.50, 274.89, 89.49, 0.00, 0.00, 0.00]],
            [2709.99, [801.50, 279.89, 93.49, 0.00, 0.00, 0.00]],
            [2719.99, [808.50, 284.89, 97.49, 0.00, 0.00, 0.00]],
            [2729.99, [815.50, 289.89, 101.49, 0.00, 0.00, 0.00]],
            [2739.99, [822.50, 294.89, 105.49, 0.00, 0.00, 0.00]],
            [2749.99, [829.50, 299.89, 109.49, 0.00, 0.00, 0.00]],
            [2759.99, [836.50, 304.89, 113.49, 0.00, 0.00, 0.00]],
            [2769.99, [843.50, 309.89, 117.49, 0.00, 0.00, 0.00]],
            [2779.99, [850.50, 314.89, 121.49, 0.00, 0.00, 0.00]],
            [2789.99, [857.50, 319.89, 125.49, 0.00, 0.00, 0.00]],
            [2799.99, [864.50, 324.89, 129.49, 0.00, 0.00, 0.00]],
            [2809.99, [871.50, 329.89, 133.49, 2.31, 0.00, 0.00]],
            [2819.99, [878.50, 334.89, 137.49, 5.31, 0.00, 0.00]],
            [2829.99, [885.50, 339.89, 141.49, 8.31, 0.00, 0.00]],
            [2839.99, [892.50, 344.89, 145.49, 11.31, 0.00, 0.00]],
            [2849.99, [899.50, 349.89, 149.49, 14.31, 0.00, 0.00]],
            [2859.99, [906.50, 354.89, 153.49, 17.31, 0.00, 0.00]],
            [2869.99, [913.50, 359.89, 157.49, 20.31, 0.00, 0.00]],
            [2879.99, [920.50, 364.89, 161.49, 23.31, 0.00, 0.00]],
            [2889.99, [927.50, 369.89, 165.49, 26.31, 0.00, 0.00]],
            [2899.99, [934.50, 374.89, 169.49, 29.31, 0.00, 0.00]],
            [2909.99, [941.50, 379.89, 173.49, 32.31, 0.00, 0.00]],
            [2919.99, [948.50, 384.89, 177.49, 35.31, 0.00, 0.00]],
            [2929.99, [955.50, 389.89, 181.49, 38.31, 0.00, 0.00]],
            [2939.99, [962.50, 394.89, 185.49, 41.31, 0.00, 0.00]],
            [2949.99, [969.50, 399.89, 189.49, 44.31, 0.00, 0.00]],
            [2959.99, [976.50, 404.89, 193.49, 47.31, 0.00, 0.00]],
            [2969.99, [983.50, 409.89, 197.49, 50.31, 0.00, 0.00]],
            [2979.99, [990.50, 414.89, 201.49, 53.31, 0.00, 0.00]],
            [2989.99, [997.50, 419.89, 205.49, 56.31, 0.00, 0.00]],
            [2999.99, [1004.50, 424.89, 209.49, 59.31, 0.00, 0.00]],
            [3009.99, [1011.50, 429.89, 213.49, 62.31, 0.00, 0.00]],
            [3019.99, [1018.50, 434.89, 217.49, 65.31, 0.00, 0.00]],
            [3029.99, [1025.50, 439.89, 221.49, 68.31, 0.00, 0.00]],
            [3039.99, [1032.50, 444.89, 225.49, 71.31, 0.00, 0.00]],
            [3049.99, [1039.50, 449.89, 229.49, 74.31, 0.00, 0.00]],
            [3059.99, [1046.50, 454.89, 233.49, 77.31, 0.00, 0.00]],
            [3069.99, [1053.50, 459.89, 237.49, 80.31, 0.00, 0.00]],
            [3079.99, [1060.50, 464.89, 241.49, 83.31, 0.00, 0.00]],
            [3089.99, [1067.50, 469.89, 245.49, 86.31, 0.00, 0.00]],
            [3099.99, [1074.50, 474.89, 249.49, 89.31, 0.00, 0.00]],
            [3109.99, [1081.50, 479.89, 253.49, 92.31, 0.00, 0.00]],
            [3119.99, [1088.50, 484.89, 257.49, 95.31, 0.00, 0.00]],
            [3129.99, [1095.50, 489.89, 261.49, 98.31, 0.33, 0.00]],
            [3139.99, [1102.50, 494.89, 265.49, 101.31, 2.33, 0.00]],
            [3149.99, [1109.50, 499.89, 269.49, 104.31, 4.33, 0.00]],
            [3159.99, [1116.50, 504.89, 273.49, 107.31, 6.33, 0.00]],
            [3169.99, [1123.50, 509.89, 277.49, 110.31, 8.33, 0.00]],
            [3179.99, [1130.50, 514.89, 281.49, 113.31, 10.33, 0.00]],
            [3189.99, [1137.50, 519.89, 285.49, 116.31, 12.33, 0.00]],
            [3199.99, [1144.50, 524.89, 289.49, 119.31, 14.33, 0.00]],
            [3209.99, [1151.50, 529.89, 293.49, 122.31, 16.33, 0.00]],
            [3219.99, [1158.50, 534.89, 297.49, 125.31, 18.33, 0.00]],
            [3229.99, [1165.50, 539.89, 301.49, 128.31, 20.33, 0.00]],
            [3239.99, [1172.50, 544.89, 305.49, 131.31, 22.33, 0.00]],
            [3249.99, [1179.50, 549.89, 309.49, 134.31, 24.33, 0.00]],
            [3259.99, [1186.50, 554.89, 313.49, 137.31, 26.33, 0.00]],
            [3269.99, [1193.50, 559.89, 317.49, 140.31, 28.33, 0.00]],
            [3279.99, [1200.50, 564.89, 321.49, 143.31, 30.33, 0.00]],
            [3289.99, [1207.50, 569.89, 325.49, 146.31, 32.33, 0.00]],
            [3299.99, [1214.50, 574.89, 329.49, 149.31, 34.33, 0.00]],
            [3309.99, [1221.50, 579.89, 333.49, 152.31, 36.33, 0.00]],
            [3319.99, [1228.50, 584.89, 337.49, 155.31, 38.33, 0.00]],
            [3329.99, [1235.50, 589.89, 341.49, 158.31, 40.33, 0.00]],
            [3339.99, [1242.50, 594.89, 345.49, 161.31, 42.33, 0.00]],
            [3349.99, [1249.50, 599.89, 349.49, 164.31, 44.33, 0.00]],
            [3359.99, [1256.50, 604.89, 353.49, 167.31, 46.33, 0.00]],
            [3369.99, [1263.50, 609.89, 357.49, 170.31, 48.33, 0.00]],
            [3379.99, [1270.50, 614.89, 361.49, 173.31, 50.33, 0.00]],
            [3389.99, [1277.50, 619.89, 365.49, 176.31, 52.33, 0.00]],
            [3399.99, [1284.50, 624.89, 369.49, 179.31, 54.33, 0.00]],
            [3409.99, [1291.50, 629.89, 373.49, 182.31, 56.33, 0.00]],
            [3419.99, [1298.50, 634.89, 377.49, 185.31, 58.33, 0.00]],
            [3429.99, [1305.50, 639.89, 381.49, 188.31, 60.33, 0.00]],
            [3439.99, [1312.50, 644.89, 385.49, 191.31, 62.33, 0.00]],
            [3449.99, [1319.50, 649.89, 389.49, 194.31, 64.33, 0.00]],
            [3459.99, [1326.50, 654.89, 393.49, 197.31, 66.33, 0.56]],
            [3469.99, [1333.50, 659.89, 397.49, 200.31, 68.33, 1.56]],
            [3479.99, [1340.50, 664.89, 401.49, 203.31, 70.33, 2.56]],
            [3489.99, [1347.50, 669.89, 405.49, 206.31, 72.33, 3.56]],
            [3499.99, [1354.50, 674.89, 409.49, 209.31, 74.33, 4.56]],
            [3509.99, [1361.50, 679.89, 413.49, 212.31, 76.33, 5.56]],
            [3519.99, [1368.50, 684.89, 417.49, 215.31, 78.33, 6.56]],
            [3529.99, [1375.50, 689.89, 421.49, 218.31, 80.33, 7.56]],
            [3539.99, [1382.50, 694.89, 425.49, 221.31, 82.33, 8.56]],
            [3549.99, [1389.50, 699.89, 429.49, 224.31, 84.33, 9.56]],
            [3559.99, [1396.50, 704.89, 433.49, 227.31, 86.33, 10.56]],
            [3569.99, [1403.50, 709.89, 437.49, 230.31, 88.33, 11.56]],
            [3579.99, [1410.50, 714.89, 441.49, 233.31, 90.33, 12.56]],
            [3589.99, [1417.50, 719.89, 445.49, 236.31, 92.33, 13.56]],
            [3599.99, [1424.50, 724.89, 449.49, 239.31, 94.33, 14.56]],
            [3609.99, [1431.50, 729.89, 453.49, 242.31, 96.33, 15.56]],
            [3619.99, [1438.50, 734.89, 457.49, 245.31, 98.33, 16.56]],
            [3629.99, [1445.50, 739.89, 461.49, 248.31, 100.33, 17.56]],
            [3639.99, [1452.50, 744.89, 465.49, 251.31, 102.33, 18.56]],
            [3649.99, [1459.50, 749.89, 469.49, 254.31, 104.33, 19.56]],
            [3659.99, [1466.50, 754.89, 473.49, 257.31, 106.33, 20.56]],
            [3669.99, [1473.50, 759.89, 477.49, 260.31, 108.33, 21.56]],
            [3679.99, [1480.50, 764.89, 481.49, 263.31, 110.33, 22.56]],
            [3689.99, [1487.50, 769.89, 485.49, 266.31, 112.33, 23.56]],
            [3699.99, [1494.50, 774.89, 489.49, 269.31, 114.33, 24.56]],
            [3709.99, [1501.50, 779.89, 493.49, 272.31, 116.33, 25.56]],
            [3719.99, [1508.50, 784.89, 497.49, 275.31, 118.33, 26.56]],
            [3729.99, [1515.50, 789.89, 501.49, 278.31, 120.33, 27.56]],
            [3739.99, [1522.50, 794.89, 505.49, 281.31, 122.33, 28.56]],
            [3749.99, [1529.50, 799.89, 509.49, 284.31, 124.33, 29.56]],
            [3759.99, [1536.50, 804.89, 513.49, 287.31, 126.33, 30.56]],
            [3769.99, [1543.50, 809.89, 517.49, 290.31, 128.33, 31.56]],
            [3779.99, [1550.50, 814.89, 521.49, 293.31, 130.33, 32.56]],
            [3789.99, [1557.50, 819.89, 525.49, 296.31, 132.33, 33.56]],
            [3799.99, [1564.50, 824.89, 529.49, 299.31, 134.33, 34.56]],
            [3809.99, [1571.50, 829.89, 533.49, 302.31, 136.33, 35.56]],
            [3819.99, [1578.50, 834.89, 537.49, 305.31, 138.33, 36.56]],
            [3829.99, [1585.50, 839.89, 541.49, 308.31, 140.33, 37.56]],
            [3839.99, [1592.50, 844.89, 545.49, 311.31, 142.33, 38.56]],
            [3849.99, [1599.50, 849.89, 549.49, 314.31, 144.33, 39.56]],
            [3859.99, [1606.50, 854.89, 553.49, 317.31, 146.33, 40.56]],
            [3869.99, [1613.50, 859.89, 557.49, 320.31, 148.33, 41.56]],
            [3879.99, [1620.50, 864.89, 561.49, 323.31, 150.33, 42.56]],
            [3889.99, [1627.50, 869.89, 565.49, 326.31, 152.33, 43.56]],
            [3899.99, [1634.50, 874.89, 569.49, 329.31, 154.33, 44.56]],
            [3909.99, [1641.50, 879.89, 573.49, 332.31, 156.33, 45.56]],
            [3919.99, [1648.50, 884.89, 577.49, 335.31, 158.33, 46.56]],
            [3929.99, [1655.50, 889.89, 581.49, 338.31, 160.33, 47.56]],
            [3939.99, [1662.50, 894.89, 585.49, 341.31, 162.33, 48.56]],
            [3949.99, [1669.50, 899.89, 589.49, 344.31, 164.33, 49.56]],
            [3959.99, [1676.50, 904.89, 593.49, 347.31, 166.33, 50.56]],
            [3969.99, [1683.50, 909.89, 597.49, 350.31, 168.33, 51.56]],
            [3979.99, [1690.50, 914.89, 601.49, 353.31, 170.33, 52.56]],
            [3989.99, [1697.50, 919.89, 605.49, 356.31, 172.33, 53.56]],
            [3999.99, [1704.50, 924.89, 609.49, 359.31, 174.33, 54.56]],
            [4009.99, [1711.50, 929.89, 613.49, 362.31, 176.33, 55.56]],
            [4019.99, [1718.50, 934.89, 617.49, 365.31, 178.33, 56.56]],
            [4029.99, [1725.50, 939.89, 621.49, 368.31, 180.33, 57.56]],
            [4039.99, [1732.50, 944.89, 625.49, 371.31, 182.33, 58.56]],
            [4049.99, [1739.50, 949.89, 629.49, 374.31, 184.33, 59.56]],
            [4059.99, [1746.50, 954.89, 633.49, 377.31, 186.33, 60.56]],
            [4069.99, [1753.50, 959.89, 637.49, 380.31, 188.33, 61.56]],
            [4079.99, [1760.50, 964.89, 641.49, 383.31, 190.33, 62.56]],
            [4089.99, [1767.50, 969.89, 645.49, 386.31, 192.33, 63.56]],
            [4099.99, [1774.50, 974.89, 649.49, 389.31, 194.33, 64.56]],
            [4109.99, [1781.50, 979.89, 653.49, 392.31, 196.33, 65.56]],
            [4119.99, [1788.50, 984.89, 657.49, 395.31, 198.33, 66.56]],
            [4129.99, [1795.50, 989.89, 661.49, 398.31, 200.33, 67.56]],
            [4139.99, [1802.50, 994.89, 665.49, 401.31, 202.33, 68.56]],
            [4149.99, [1809.50, 999.89, 669.49, 404.31, 204.33, 69.56]],
            [4159.99, [1816.50, 1004.89, 673.49, 407.31, 206.33, 70.56]],
            [4169.99, [1823.50, 1009.89, 677.49, 410.31, 208.33, 71.56]],
            [4179.99, [1830.50, 1014.89, 681.49, 413.31, 210.33, 72.56]],
            [4189.99, [1837.50, 1019.89, 685.49, 416.31, 212.33, 73.56]],
            [4199.99, [1844.50, 1024.89, 689.49, 419.31, 214.33, 74.56]],
            [4209.99, [1851.50, 1029.89, 693.49, 422.31, 216.33, 75.56]],
            [4219.99, [1858.50, 1034.89, 697.49, 425.31, 218.33, 76.56]],
            [4229.99, [1865.50, 1039.89, 701.49, 428.31, 220.33, 77.56]],
            [4239.99, [1872.50, 1044.89, 705.49, 431.31, 222.33, 78.56]],
            [4249.99, [1879.50, 1049.89, 709.49, 434.31, 224.33, 79.56]],
            [4259.99, [1886.50, 1054.89, 713.49, 437.31, 226.33, 80.56]],
            [4269.99, [1893.50, 1059.89, 717.49, 440.31, 228.33, 81.56]],
            [4279.99, [1900.50, 1064.89, 721.49, 443.31, 230.33, 82.56]],
            [4289.99, [1907.50, 1069.89, 725.49, 446.31, 232.33, 83.56]],
            [4299.99, [1914.50, 1074.89, 729.49, 449.31, 234.33, 84.56]],
            [4309.99, [1921.50, 1079.89, 733.49, 452.31, 236.33, 85.56]],
            [4319.99, [1928.50, 1084.89, 737.49, 455.31, 238.33, 86.56]],
            [4329.99, [1935.50, 1089.89, 741.49, 458.31, 240.33, 87.56]],
            [4339.99, [1942.50, 1094.89, 745.49, 461.31, 242.33, 88.56]],
            [4349.99, [1949.50, 1099.89, 749.49, 464.31, 244.33, 89.56]],
            [4359.99, [1956.50, 1104.89, 753.49, 467.31, 246.33, 90.56]],
            [4369.99, [1963.50, 1109.89, 757.49, 470.31, 248.33, 91.56]],
            [4379.99, [1970.50, 1114.89, 761.49, 473.31, 250.33, 92.56]],
            [4389.99, [1977.50, 1119.89, 765.49, 476.31, 252.33, 93.56]],
            [4399.99, [1984.50, 1124.89, 769.49, 479.31, 254.33, 94.56]],
            [4409.99, [1991.50, 1129.89, 773.49, 482.31, 256.33, 95.56]],
            [4419.99, [1998.50, 1134.89, 777.49, 485.31, 258.33, 96.56]],
            [4429.99, [2005.50, 1139.89, 781.49, 488.31, 260.33, 97.56]],
            [4439.99, [2012.50, 1144.89, 785.49, 491.31, 262.33, 98.56]],
            [4449.99, [2019.50, 1149.89, 789.49, 494.31, 264.33, 99.56]],
            [4459.99, [2026.50, 1154.89, 793.49, 497.31, 266.33, 100.56]],
            [4469.99, [2033.50, 1159.89, 797.49, 500.31, 268.33, 101.56]],
            [4479.99, [2040.50, 1164.89, 801.49, 503.31, 270.33, 102.56]],
            [4489.99, [2047.50, 1169.89, 805.49, 506.31, 272.33, 103.56]],
            [4499.99, [2054.50, 1174.89, 809.49, 509.31, 274.33, 104.56]],
            [4509.99, [2061.50, 1179.89, 813.49, 512.31, 276.33, 105.56]],
            [4519.99, [2068.50, 1184.89, 817.49, 515.31, 278.33, 106.56]],
            [4529.99, [2075.50, 1189.89, 821.49, 518.31, 280.33, 107.56]],
            [4539.99, [2082.50, 1194.89, 825.49, 521.31, 282.33, 108.56]],
            [4549.99, [2089.50, 1199.89, 829.49, 524.31, 284.33, 109.56]],
            [4559.99, [2096.50, 1204.89, 833.49, 527.31, 286.33, 110.56]],
            [4569.99, [2103.50, 1209.89, 837.49, 530.31, 288.33, 111.56]],
            [4579.99, [2110.50, 1214.89, 841.49, 533.31, 290.33, 112.56]],
            [4589.99, [2117.50, 1219.89, 845.49, 536.31, 292.33, 113.56]],
            [4599.99, [2124.50, 1224.89, 849.49, 539.31, 294.33, 114.56]],
            [4609.99, [2131.50, 1229.89, 853.49, 542.31, 296.33, 115.56]],
            [4619.99, [2138.50, 1234.89, 857.49, 545.31, 298.33, 116.56]],
            [4629.99, [2145.50, 1239.89, 861.49, 548.31, 300.33, 117.56]],
            [4639.99, [2152.50, 1244.89, 865.49, 551.31, 302.33, 118.56]],
            [4649.99, [2159.50, 1249.89, 869.49, 554.31, 304.33, 119.56]],
            [4659.99, [2166.50, 1254.89, 873.49, 557.31, 306.33, 120.56]],
            [4669.99, [2173.50, 1259.89, 877.49, 560.31, 308.33, 121.56]],
            [4679.99, [2180.50, 1264.89, 881.49, 563.31, 310.33, 122.56]],
            [4689.99, [2187.50, 1269.89, 885.49, 566.31, 312.33, 123.56]],
            [4699.99, [2194.50, 1274.89, 889.49, 569.31, 314.33, 124.56]],
            [4709.99, [2201.50, 1279.89, 893.49, 572.31, 316.33, 125.56]],
            [4719.99, [2208.50, 1284.89, 897.49, 575.31, 318.33, 126.56]],
            [4729.99, [2215.50, 1289.89, 901.49, 578.31, 320.33, 127.56]],
            [4739.99, [2222.50, 1294.89, 905.49, 581.31, 322.33, 128.56]],
            [4749.99, [2229.50, 1299.89, 909.49, 584.31, 324.33, 129.56]],
            [4759.99, [2236.50, 1304.89, 913.49, 587.31, 326.33, 130.56]],
            [4766.99, [2243.50, 1309.89, 917.49, 590.31, 328.33, 131.56]]
            // Above 4766.99 EUR: fully garnishable
        ];
        
        // Legacy garnishment table 2024 (for backward compatibility)
        this.garnishmentTable = [
            [1410.00, 0.00],      // Below 1410 EUR - no garnishment
            [1500.00, 26.67],
            [1600.00, 56.67],
            [1700.00, 86.67],
            [1800.00, 116.67],
            [1900.00, 146.67],
            [2000.00, 176.67],
            [2100.00, 206.67],
            [2200.00, 236.67],
            [2300.00, 266.67],
            [2400.00, 296.67],
            [2500.00, 326.67],
            [2600.00, 356.67],
            [2700.00, 386.67],
            [2800.00, 416.67],
            [2900.00, 446.67],
            [3000.00, 476.67],
            [3200.00, 526.67],
            [3400.00, 576.67],
            [3600.00, 626.67],
            [3800.00, 676.67],
            [4000.00, 726.67],
            [4500.00, 876.67],
            [5000.00, 1026.67]
        ];
        
        // Dependent adjustments (amounts that reduce garnishable income)
        this.dependentProtection = {
            spouse: 564.02,      // Protected amount for spouse (married status)
            child: 451.17        // Protected amount per child
        };
        
        console.log('✅ German Garnishment Calculator ready (with 2025-2026 table)');
    }

    /**
     * Calculate garnishable income - automatically uses current 2025-2026 table
     * This is the main method that should be used for new calculations
     */
    calculate(netIncome, maritalStatus, numberOfChildren = 0) {
        return this.calculateGarnishableIncome2025(netIncome, maritalStatus, numberOfChildren);
    }

    /**
     * Calculate garnishable income based on German law 2025-2026
     * @param {number} netIncome - Monthly net income in EUR
     * @param {string} maritalStatus - 'ledig', 'verheiratet', 'geschieden', 'verwitwet'
     * @param {number} numberOfChildren - Number of dependent children
     * @returns {Object} Calculation result with garnishable amount and details
     */
    calculateGarnishableIncome2025(netIncome, maritalStatus, numberOfChildren = 0) {
        try {
            console.log(`💰 Calculating garnishable income (2025-2026):`);
            console.log(`   Net income: ${netIncome} EUR`);
            console.log(`   Marital status: ${maritalStatus}`);
            console.log(`   Children: ${numberOfChildren}`);
            
            // Validate inputs
            if (netIncome < 0) {
                throw new Error('Net income cannot be negative');
            }
            if (numberOfChildren < 0) {
                throw new Error('Number of children cannot be negative');
            }
            
            // Calculate total dependents for table lookup
            let totalDependents = numberOfChildren;
            
            // For married persons, spouse counts as 1 dependent in the new table
            if (maritalStatus === 'verheiratet') {
                totalDependents += 1;
            }
            
            console.log(`   Total dependents for table lookup: ${totalDependents}`);
            
            // Get garnishable amount directly from 2025-2026 table
            const garnishableAmount = this._getGarnishableAmount2025(netIncome, totalDependents);
            
            // Cannot garnish more than the actual net income
            const finalGarnishable = Math.min(garnishableAmount, netIncome);
            
            // Round to 2 decimal places
            const roundedGarnishable = Math.round(finalGarnishable * 100) / 100;
            
            const calculationDetails = {
                netIncome: netIncome,
                maritalStatus: maritalStatus,
                numberOfChildren: numberOfChildren,
                totalDependents: totalDependents,
                tableYear: '2025-2026',
                baseGarnishableAmount: garnishableAmount,
                finalGarnishableAmount: roundedGarnishable,
                remainingIncome: netIncome - roundedGarnishable,
                garnishmentPercentage: netIncome > 0 ? (roundedGarnishable / netIncome * 100) : 0
            };
            
            console.log(`✅ Final garnishable amount: ${roundedGarnishable} EUR`);
            console.log(`   Remaining income: ${calculationDetails.remainingIncome} EUR`);
            console.log(`   Garnishment percentage: ${calculationDetails.garnishmentPercentage.toFixed(1)}%`);
            
            return {
                success: true,
                garnishableAmount: roundedGarnishable,
                calculationDetails: calculationDetails
            };
            
        } catch (error) {
            console.error('❌ Error calculating garnishable income:', error.message);
            return {
                success: false,
                error: error.message,
                garnishableAmount: 0
            };
        }
    }

    /**
     * Calculate garnishable income based on German law (legacy 2024)
     * @param {number} netIncome - Monthly net income in EUR
     * @param {string} maritalStatus - 'ledig', 'verheiratet', 'geschieden', 'verwitwet'
     * @param {number} numberOfChildren - Number of dependent children
     * @returns {Object} Calculation result with garnishable amount and details
     */
    calculateGarnishableIncome(netIncome, maritalStatus, numberOfChildren = 0) {
        try {
            console.log(`💰 Calculating garnishable income:`);
            console.log(`   Net income: ${netIncome} EUR`);
            console.log(`   Marital status: ${maritalStatus}`);
            console.log(`   Children: ${numberOfChildren}`);
            
            // Validate inputs
            if (netIncome < 0) {
                throw new Error('Net income cannot be negative');
            }
            if (numberOfChildren < 0) {
                throw new Error('Number of children cannot be negative');
            }
            
            // Calculate protected amounts for dependents
            let totalProtectedAmount = 0;
            let spouseProtection = 0;
            let childrenProtection = 0;
            
            // Married status provides spouse protection
            if (maritalStatus === 'verheiratet') {
                spouseProtection = this.dependentProtection.spouse;
                totalProtectedAmount += spouseProtection;
            }
            
            // Child protection
            if (numberOfChildren > 0) {
                childrenProtection = this.dependentProtection.child * numberOfChildren;
                totalProtectedAmount += childrenProtection;
            }
            
            // Effective income for garnishment table lookup (income + protections)
            const adjustedIncome = netIncome + totalProtectedAmount;
            
            console.log(`   Spouse protection: ${spouseProtection} EUR`);
            console.log(`   Children protection: ${childrenProtection} EUR`);
            console.log(`   Total protected: ${totalProtectedAmount} EUR`);
            console.log(`   Adjusted income for table: ${adjustedIncome} EUR`);
            
            // Get base garnishable amount from table
            const baseGarnishable = this._getBaseGarnishableAmount(adjustedIncome);
            
            // Subtract protected amounts to get final garnishable amount
            let finalGarnishable = Math.max(0, baseGarnishable - totalProtectedAmount);
            
            // Cannot garnish more than the actual net income
            finalGarnishable = Math.min(finalGarnishable, netIncome);
            
            // Round to 2 decimal places
            finalGarnishable = Math.round(finalGarnishable * 100) / 100;
            
            const calculationDetails = {
                netIncome: netIncome,
                maritalStatus: maritalStatus,
                numberOfChildren: numberOfChildren,
                protectedAmounts: {
                    spouse: spouseProtection,
                    children: childrenProtection,
                    total: totalProtectedAmount
                },
                adjustedIncome: adjustedIncome,
                baseGarnishableAmount: baseGarnishable,
                finalGarnishableAmount: finalGarnishable,
                remainingIncome: netIncome - finalGarnishable,
                garnishmentPercentage: netIncome > 0 ? (finalGarnishable / netIncome * 100) : 0
            };
            
            console.log(`✅ Final garnishable amount: ${finalGarnishable} EUR`);
            console.log(`   Remaining income: ${calculationDetails.remainingIncome} EUR`);
            console.log(`   Garnishment percentage: ${calculationDetails.garnishmentPercentage.toFixed(1)}%`);
            
            return {
                success: true,
                garnishableAmount: finalGarnishable,
                calculationDetails: calculationDetails
            };
            
        } catch (error) {
            console.error('❌ Error calculating garnishable income:', error.message);
            return {
                success: false,
                error: error.message,
                garnishableAmount: 0
            };
        }
    }

    /**
     * Get garnishable amount from German garnishment table 2025-2026
     * @private
     * @param {number} netIncome - Net monthly income
     * @param {number} numberOfDependents - Number of dependents (0-5+)
     */
    _getGarnishableAmount2025(netIncome, numberOfDependents) {
        // Table supports 0-5 dependents (index 0-5), 5+ uses index 5
        const dependentIndex = Math.min(numberOfDependents, 5);
        
        console.log(`📊 Looking up garnishment for ${netIncome} EUR, ${numberOfDependents} dependents (table index: ${dependentIndex})`);
        
        // Find the appropriate bracket in the garnishment table
        for (let i = 0; i < this.garnishmentTable2025.length; i++) {
            const [threshold, garnishableAmounts] = this.garnishmentTable2025[i];
            
            if (netIncome <= threshold) {
                const garnishable = garnishableAmounts[dependentIndex];
                console.log(`📊 Found bracket: ${threshold} EUR -> ${garnishable} EUR garnishable`);
                return garnishable;
            }
        }
        
        // For income above highest bracket (4766.99 EUR), everything is fully garnishable
        const highestThreshold = 4766.99;
        if (netIncome > highestThreshold) {
            // Above 4766.99 EUR, full amount is garnishable (no protected amounts)
            console.log(`📊 Above highest bracket: ${highestThreshold} EUR`);
            console.log(`   Full garnishment applies: ${netIncome} EUR`);
            
            return netIncome;
        }
        
        return 0;
    }

    /**
     * Get base garnishable amount from German garnishment table (legacy 2024)
     * @private
     */
    _getBaseGarnishableAmount(adjustedIncome) {
        // Find the appropriate bracket in the garnishment table
        for (let i = 0; i < this.garnishmentTable.length; i++) {
            const [threshold, garnishable] = this.garnishmentTable[i];
            
            if (adjustedIncome <= threshold) {
                console.log(`📊 Found bracket: ${threshold} EUR -> ${garnishable} EUR garnishable`);
                return garnishable;
            }
        }
        
        // For income above highest bracket (5000 EUR), calculate proportionally
        const [highestThreshold, highestGarnishable] = this.garnishmentTable[this.garnishmentTable.length - 1];
        if (adjustedIncome > highestThreshold) {
            const excess = adjustedIncome - highestThreshold;
            // Above 5000 EUR, typically 50% of excess is garnishable
            const additionalGarnishable = excess * 0.5;
            const totalGarnishable = highestGarnishable + additionalGarnishable;
            
            console.log(`📊 Above highest bracket: ${highestThreshold} EUR`);
            console.log(`   Excess: ${excess} EUR -> Additional: ${additionalGarnishable} EUR`);
            console.log(`   Total garnishable: ${totalGarnishable} EUR`);
            
            return totalGarnishable;
        }
        
        return 0;
    }

    /**
     * Calculate total debt from Phase 1 creditor response data
     * Uses the creditorContactService data to get finalized debt amounts
     */
    calculateTotalDebtFromCreditors(clientReference, creditorContactService) {
        try {
            if (!creditorContactService || !creditorContactService.creditorContacts) {
                throw new Error('CreditorContactService not available');
            }

            console.log(`📊 Calculating total debt for client: ${clientReference}`);

            // Get all contacts for this client
            const clientContacts = Array.from(creditorContactService.creditorContacts.values())
                .filter(contact => contact.client_reference === clientReference);

            if (clientContacts.length === 0) {
                console.log('❌ No creditor contacts found for client');
                return {
                    success: false,
                    error: 'No creditor contacts found',
                    totalDebt: 0,
                    creditorCount: 0
                };
            }

            let totalDebt = 0;
            const creditorSummary = [];

            for (const contact of clientContacts) {
                const debtAmount = contact.final_debt_amount || 0;
                totalDebt += debtAmount;

                creditorSummary.push({
                    creditor_name: contact.creditor_name,
                    reference_number: contact.reference_number,
                    final_debt_amount: debtAmount,
                    amount_source: contact.amount_source || 'unknown',
                    contact_status: contact.contact_status || 'unknown'
                });
            }

            console.log(`✅ Total debt calculated: ${totalDebt} EUR from ${clientContacts.length} creditors`);
            
            return {
                success: true,
                totalDebt: Math.round(totalDebt * 100) / 100,
                creditorCount: clientContacts.length,
                creditorSummary: creditorSummary,
                calculation_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error calculating total debt:', error.message);
            return {
                success: false,
                error: error.message,
                totalDebt: 0,
                creditorCount: 0
            };
        }
    }

    /**
     * Calculate individual creditor quotas based on total garnishable income
     */
    calculateCreditorQuotas(clientReference, garnishableIncome, creditorContactService) {
        try {
            console.log(`💰 Calculating creditor quotas:`);
            console.log(`   Client: ${clientReference}`);
            console.log(`   Garnishable income: ${garnishableIncome} EUR/month`);

            // Get total debt and creditor summary
            const debtResult = this.calculateTotalDebtFromCreditors(clientReference, creditorContactService);
            if (!debtResult.success) {
                throw new Error(debtResult.error);
            }

            const { totalDebt, creditorSummary } = debtResult;

            if (totalDebt === 0) {
                throw new Error('Total debt is zero - cannot calculate quotas');
            }

            const creditorQuotas = [];

            for (const creditor of creditorSummary) {
                const debtAmount = creditor.final_debt_amount;
                const debtPercentage = debtAmount / totalDebt;
                const monthlyQuota = garnishableIncome * debtPercentage;

                creditorQuotas.push({
                    creditor_name: creditor.creditor_name,
                    reference_number: creditor.reference_number,
                    debt_amount: debtAmount,
                    debt_percentage: Math.round(debtPercentage * 10000) / 100, // Convert to percentage with 2 decimals
                    monthly_quota: Math.round(monthlyQuota * 100) / 100,
                    annual_quota: Math.round(monthlyQuota * 12 * 100) / 100,
                    quota_36_months: Math.round(monthlyQuota * 36 * 100) / 100,
                    amount_source: creditor.amount_source,
                    contact_status: creditor.contact_status
                });
            }

            // Verify quotas sum to total garnishable income (within rounding tolerance)
            const totalQuotas = creditorQuotas.reduce((sum, q) => sum + q.monthly_quota, 0);
            const difference = Math.abs(totalQuotas - garnishableIncome);

            console.log(`✅ Calculated ${creditorQuotas.length} creditor quotas`);
            console.log(`   Total debt: ${totalDebt} EUR`);
            console.log(`   Monthly quotas sum: ${totalQuotas} EUR`);
            console.log(`   Target garnishable: ${garnishableIncome} EUR`);
            console.log(`   Difference: ${difference} EUR`);

            return {
                success: true,
                clientReference: clientReference,
                totalDebt: totalDebt,
                creditorCount: creditorQuotas.length,
                garnishableIncome: garnishableIncome,
                creditorQuotas: creditorQuotas,
                quotasSumCheck: {
                    calculated_total: totalQuotas,
                    target_total: garnishableIncome,
                    difference: difference,
                    within_tolerance: difference < 0.10 // Within 10 cents
                },
                calculation_timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error calculating creditor quotas:', error.message);
            return {
                success: false,
                error: error.message,
                clientReference: clientReference
            };
        }
    }

    /**
     * Generate complete financial restructuring analysis
     * Combines garnishment calculation with Phase 1 creditor data
     */
    generateRestructuringAnalysis(clientReference, financialData, creditorContactService) {
        try {
            console.log(`📋 Generating restructuring analysis for: ${clientReference}`);

            // Calculate garnishable income using current 2025-2026 table
            const garnishmentResult = this.calculate(
                financialData.netIncome,
                financialData.maritalStatus,
                financialData.numberOfChildren
            );

            if (!garnishmentResult.success) {
                throw new Error(`Garnishment calculation failed: ${garnishmentResult.error}`);
            }

            // Calculate creditor quotas
            const quotasResult = this.calculateCreditorQuotas(
                clientReference,
                garnishmentResult.garnishableAmount,
                creditorContactService
            );

            if (!quotasResult.success) {
                throw new Error(`Quota calculation failed: ${quotasResult.error}`);
            }

            // Generate analysis summary
            const analysis = {
                success: true,
                clientReference: clientReference,
                analysis_date: new Date().toISOString(),
                
                // Input data
                financialInput: {
                    netIncome: financialData.netIncome,
                    maritalStatus: financialData.maritalStatus,
                    numberOfChildren: financialData.numberOfChildren
                },
                
                // Garnishment calculation
                garnishment: garnishmentResult,
                
                // Debt and quota analysis
                debtAnalysis: {
                    totalDebt: quotasResult.totalDebt,
                    creditorCount: quotasResult.creditorCount,
                    garnishableIncome: quotasResult.garnishableIncome,
                    creditorQuotas: quotasResult.creditorQuotas
                },
                
                // Financial projections
                projections: {
                    monthly_payment: quotasResult.garnishableIncome,
                    annual_payment: quotasResult.garnishableIncome * 12,
                    payment_36_months: quotasResult.garnishableIncome * 36,
                    debt_coverage_36_months: quotasResult.totalDebt > 0 ? 
                        (quotasResult.garnishableIncome * 36 / quotasResult.totalDebt * 100) : 0
                },
                
                // Quality checks
                qualityChecks: {
                    quotas_sum_correct: quotasResult.quotasSumCheck.within_tolerance,
                    all_creditors_have_quotas: quotasResult.creditorQuotas.every(q => q.monthly_quota > 0),
                    reasonable_garnishment_rate: garnishmentResult.calculationDetails.garnishmentPercentage <= 50
                }
            };

            console.log(`✅ Restructuring analysis complete:`);
            console.log(`   Total debt: ${analysis.debtAnalysis.totalDebt} EUR`);
            console.log(`   Monthly payment: ${analysis.projections.monthly_payment} EUR`);
            console.log(`   36-month coverage: ${analysis.projections.debt_coverage_36_months.toFixed(1)}%`);

            return analysis;

        } catch (error) {
            console.error('❌ Error generating restructuring analysis:', error.message);
            return {
                success: false,
                error: error.message,
                clientReference: clientReference
            };
        }
    }

    /**
     * Test the new 2025-2026 calculator with sample data
     */
    testCalculator2025() {
        console.log('\n🧪 Testing German Garnishment Calculator 2025-2026...\n');

        const testCases = [
            {
                name: 'Single person, no children, low income (below threshold)',
                netIncome: 1500.00,
                maritalStatus: 'ledig',
                children: 0,
                expectedMin: 0,
                expectedMax: 0
            },
            {
                name: 'Single person, no children, medium income',
                netIncome: 2500.00,
                maritalStatus: 'ledig',
                children: 0,
                expectedMin: 650,
                expectedMax: 700
            },
            {
                name: 'Married with 1 child (2 dependents total)',
                netIncome: 3000.00,
                maritalStatus: 'verheiratet',
                children: 1,
                expectedMin: 200,
                expectedMax: 220
            },
            {
                name: 'Single parent, 2 children',
                netIncome: 3500.00,
                maritalStatus: 'ledig',
                children: 2,
                expectedMin: 400,
                expectedMax: 420
            },
            {
                name: 'High income, no dependents (fully garnishable)',
                netIncome: 5000.00,
                maritalStatus: 'ledig',
                children: 0,
                expectedMin: 5000,
                expectedMax: 5000
            }
        ];

        let passedTests = 0;

        for (const test of testCases) {
            console.log(`📋 Test: ${test.name}`);
            
            const result = this.calculateGarnishableIncome2025(
                test.netIncome,
                test.maritalStatus,
                test.children
            );

            if (result.success) {
                const garnishable = result.garnishableAmount;
                const passed = garnishable >= test.expectedMin && garnishable <= test.expectedMax;
                
                console.log(`   Result: ${garnishable} EUR ${passed ? '✅' : '❌'}`);
                console.log(`   Expected: ${test.expectedMin}-${test.expectedMax} EUR`);
                
                if (passed) passedTests++;
            } else {
                console.log(`   Failed: ${result.error} ❌`);
            }
            
            console.log('');
        }

        console.log(`📊 Test Results: ${passedTests}/${testCases.length} tests passed\n`);
        return passedTests === testCases.length;
    }

    /**
     * Test the legacy calculator with sample data
     */
    testCalculator() {
        console.log('\n🧪 Testing German Garnishment Calculator...\n');

        const testCases = [
            {
                name: 'Single person, no children, medium income',
                netIncome: 2500.00,
                maritalStatus: 'ledig',
                children: 0,
                expectedMin: 300,
                expectedMax: 350
            },
            {
                name: 'Married with 2 children, medium income',
                netIncome: 3000.00,
                maritalStatus: 'verheiratet',
                children: 2,
                expectedMin: 0,
                expectedMax: 50
            },
            {
                name: 'Single person, high income',
                netIncome: 4500.00,
                maritalStatus: 'ledig',
                children: 0,
                expectedMin: 800,
                expectedMax: 900
            },
            {
                name: 'Low income, protected',
                netIncome: 1300.00,
                maritalStatus: 'ledig',
                children: 0,
                expectedMin: 0,
                expectedMax: 0
            }
        ];

        let passedTests = 0;

        for (const test of testCases) {
            console.log(`📋 Test: ${test.name}`);
            
            const result = this.calculateGarnishableIncome(
                test.netIncome,
                test.maritalStatus,
                test.children
            );

            if (result.success) {
                const garnishable = result.garnishableAmount;
                const passed = garnishable >= test.expectedMin && garnishable <= test.expectedMax;
                
                console.log(`   Result: ${garnishable} EUR ${passed ? '✅' : '❌'}`);
                console.log(`   Expected: ${test.expectedMin}-${test.expectedMax} EUR`);
                
                if (passed) passedTests++;
            } else {
                console.log(`   Failed: ${result.error} ❌`);
            }
            
            console.log('');
        }

        console.log(`📊 Test Results: ${passedTests}/${testCases.length} tests passed\n`);
        return passedTests === testCases.length;
    }
}

module.exports = GermanGarnishmentCalculator;