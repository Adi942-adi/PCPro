export const seedComponents = [
  {
    type: "cpu",
    name: "AMD Ryzen 5 7600",
    brand: "AMD",
    price: 219,
    specs: {
      socket: "AM5",
      generation: "ryzen-7000",
      minBiosVersion: "1.00",
      cores: 6,
      threads: 12,
      tdp: 65,
      integratedGraphics: true
    }
  },
  {
    type: "cpu",
    name: "AMD Ryzen 7 7800X3D",
    brand: "AMD",
    price: 389,
    specs: {
      socket: "AM5",
      generation: "ryzen-7000",
      minBiosVersion: "1.30",
      cores: 8,
      threads: 16,
      tdp: 120,
      integratedGraphics: true
    }
  },
  {
    type: "cpu",
    name: "Intel Core i5-14600K",
    brand: "Intel",
    price: 319,
    specs: {
      socket: "LGA1700",
      generation: "intel-14th",
      minBiosVersion: "1205",
      cores: 14,
      threads: 20,
      tdp: 125,
      integratedGraphics: true
    }
  },
  {
    type: "cpu",
    name: "Intel Core i7-14700K",
    brand: "Intel",
    price: 409,
    specs: {
      socket: "LGA1700",
      generation: "intel-14th",
      minBiosVersion: "1205",
      cores: 20,
      threads: 28,
      tdp: 125,
      integratedGraphics: true
    }
  },
  {
    type: "motherboard",
    name: "MSI MAG B650 Tomahawk WiFi",
    brand: "MSI",
    price: 219,
    specs: {
      socket: "AM5",
      ramType: "DDR5",
      formFactor: "ATX",
      maxMemoryGb: 192,
      maxRamSpeedMhz: 6600,
      ramQvlSpeedsMhz: [5200, 5600, 6000, 6200, 6400],
      m2Slots: 3,
      pcieX16Slots: 1,
      pcieX16Version: 4,
      primaryPcieLanes: 16,
      biosVersion: "1.40",
      biosSupportedGenerations: ["ryzen-7000"],
      biosFlashback: true,
      internalHeaders: ["front-panel", "hd-audio", "usb-a-5g", "usb-c-10g"]
    }
  },
  {
    type: "motherboard",
    name: "ASUS TUF Gaming B650M-Plus",
    brand: "ASUS",
    price: 179,
    specs: {
      socket: "AM5",
      ramType: "DDR5",
      formFactor: "mATX",
      maxMemoryGb: 192,
      maxRamSpeedMhz: 6400,
      ramQvlSpeedsMhz: [5200, 5600, 6000, 6200],
      m2Slots: 2,
      pcieX16Slots: 1,
      pcieX16Version: 4,
      primaryPcieLanes: 16,
      biosVersion: "1.35",
      biosSupportedGenerations: ["ryzen-7000"],
      biosFlashback: true,
      internalHeaders: ["front-panel", "hd-audio", "usb-a-5g"]
    }
  },
  {
    type: "motherboard",
    name: "Gigabyte Z790 Aorus Elite AX",
    brand: "Gigabyte",
    price: 259,
    specs: {
      socket: "LGA1700",
      ramType: "DDR5",
      formFactor: "ATX",
      maxMemoryGb: 192,
      maxRamSpeedMhz: 7200,
      ramQvlSpeedsMhz: [5600, 6000, 6400, 6800, 7200],
      m2Slots: 4,
      pcieX16Slots: 1,
      pcieX16Version: 5,
      primaryPcieLanes: 16,
      biosVersion: "1301",
      biosSupportedGenerations: ["intel-12th", "intel-13th", "intel-14th"],
      biosFlashback: true,
      internalHeaders: ["front-panel", "hd-audio", "usb-a-5g", "usb-c-20g"]
    }
  },
  {
    type: "motherboard",
    name: "MSI PRO B760M-A WiFi",
    brand: "MSI",
    price: 169,
    specs: {
      socket: "LGA1700",
      ramType: "DDR5",
      formFactor: "mATX",
      maxMemoryGb: 192,
      maxRamSpeedMhz: 6800,
      ramQvlSpeedsMhz: [5600, 6000, 6400, 6800],
      m2Slots: 2,
      pcieX16Slots: 1,
      pcieX16Version: 4,
      primaryPcieLanes: 16,
      biosVersion: "1000",
      biosSupportedGenerations: ["intel-12th", "intel-13th", "intel-14th"],
      biosFlashback: true,
      internalHeaders: ["front-panel", "hd-audio", "usb-a-5g", "usb-c-10g"]
    }
  },
  {
    type: "ram",
    name: "Corsair Vengeance 32GB (2x16) DDR5-6000",
    brand: "Corsair",
    price: 109,
    specs: { ramType: "DDR5", capacityGb: 32, speedMhz: 6000, sticks: 2, heightMm: 35 }
  },
  {
    type: "ram",
    name: "G.Skill Trident Z5 32GB (2x16) DDR5-6400",
    brand: "G.Skill",
    price: 129,
    specs: { ramType: "DDR5", capacityGb: 32, speedMhz: 6400, sticks: 2, heightMm: 44 }
  },
  {
    type: "ram",
    name: "Kingston Fury Beast 32GB (2x16) DDR4-3600",
    brand: "Kingston",
    price: 89,
    specs: { ramType: "DDR4", capacityGb: 32, speedMhz: 3600, sticks: 2, heightMm: 34 }
  },
  {
    type: "gpu",
    name: "NVIDIA GeForce RTX 4070 Super",
    brand: "NVIDIA",
    price: 599,
    specs: { tdp: 220, lengthMm: 300, vramGb: 12, pcieRequiredVersion: 4, pcieLanesRequired: 16 }
  },
  {
    type: "gpu",
    name: "NVIDIA GeForce RTX 4080 Super",
    brand: "NVIDIA",
    price: 999,
    specs: { tdp: 320, lengthMm: 340, vramGb: 16, pcieRequiredVersion: 4, pcieLanesRequired: 16 }
  },
  {
    type: "gpu",
    name: "AMD Radeon RX 7800 XT",
    brand: "AMD",
    price: 499,
    specs: { tdp: 263, lengthMm: 300, vramGb: 16, pcieRequiredVersion: 4, pcieLanesRequired: 16 }
  },
  {
    type: "storage",
    name: "Samsung 990 Pro 2TB NVMe SSD",
    brand: "Samsung",
    price: 159,
    specs: { interface: "NVMe", capacityTb: 2, wattage: 8 }
  },
  {
    type: "storage",
    name: "Crucial P3 Plus 1TB NVMe SSD",
    brand: "Crucial",
    price: 69,
    specs: { interface: "NVMe", capacityTb: 1, wattage: 7 }
  },
  {
    type: "psu",
    name: "Corsair RM750e",
    brand: "Corsair",
    price: 109,
    specs: { wattage: 750, efficiency: "80+ Gold", modular: "Full" }
  },
  {
    type: "psu",
    name: "MSI MAG A850GL",
    brand: "MSI",
    price: 129,
    specs: { wattage: 850, efficiency: "80+ Gold", modular: "Full" }
  },
  {
    type: "psu",
    name: "Cooler Master MWE Gold 650 V2",
    brand: "Cooler Master",
    price: 84,
    specs: { wattage: 650, efficiency: "80+ Gold", modular: "Semi" }
  },
  {
    type: "case",
    name: "NZXT H6 Flow",
    brand: "NZXT",
    price: 109,
    imageUrl: "https://picsum.photos/seed/nzxt-h6-flow-case/900/700",
    specs: {
      supportedFormFactors: ["ATX", "mATX", "Mini-ITX"],
      gpuMaxLengthMm: 365,
      cpuCoolerMaxHeightMm: 163,
      airCoolerRamClearanceMm: 42,
      radiatorSupport: [240, 280, 360],
      frontPanelConnectors: ["front-panel", "hd-audio", "usb-a-5g", "usb-c-10g"],
      heightMm: 435,
      widthMm: 287,
      depthMm: 415
    }
  },
  {
    type: "case",
    name: "Corsair 4000D Airflow",
    brand: "Corsair",
    price: 99,
    imageUrl: "https://picsum.photos/seed/corsair-4000d-case/900/700",
    specs: {
      supportedFormFactors: ["ATX", "mATX", "Mini-ITX"],
      gpuMaxLengthMm: 360,
      cpuCoolerMaxHeightMm: 170,
      airCoolerRamClearanceMm: 45,
      radiatorSupport: [240, 280, 360],
      frontPanelConnectors: ["front-panel", "hd-audio", "usb-a-5g", "usb-c-10g"],
      heightMm: 466,
      widthMm: 230,
      depthMm: 453
    }
  },
  {
    type: "case",
    name: "Cooler Master NR200",
    brand: "Cooler Master",
    price: 94,
    imageUrl: "https://picsum.photos/seed/coolermaster-nr200-case/900/700",
    specs: {
      supportedFormFactors: ["Mini-ITX"],
      gpuMaxLengthMm: 330,
      cpuCoolerMaxHeightMm: 155,
      airCoolerRamClearanceMm: 40,
      radiatorSupport: [120, 240, 280],
      frontPanelConnectors: ["front-panel", "hd-audio", "usb-a-5g"],
      heightMm: 292,
      widthMm: 185,
      depthMm: 376
    }
  }
];
