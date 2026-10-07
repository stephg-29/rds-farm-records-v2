// ============================================================
// FENCE MAP DATA (made-up test data for Farm Records v2 import)
// Location is invented: farmland west of Tamworth NSW.
// ============================================================
window.FARM_DATA = {
  "version": 1,
  "properties": [
    {
      "id": "block",
      "name": "The Block 1",
      "center": [
        -31.0645,
        150.72825
      ],
      "zoom": 16,
      "units": [
        {
          "id": "u1",
          "name": "Unit 1 - Front",
          "note": "Cutout at the front gate strainer",
          "latlng": [
            -31.06022,
            150.72055
          ]
        },
        {
          "id": "u2",
          "name": "Unit 2 - Back",
          "note": "Solar unit on the back fence",
          "latlng": [
            -31.06877,
            150.73045
          ]
        }
      ],
      "features": [
        {
          "id": "p1",
          "type": "paddock",
          "name": "Front Pdk",
          "note": "",
          "coords": [
            [
              -31.06,
              150.72
            ],
            [
              -31.06,
              150.7255
            ],
            [
              -31.0645,
              150.7255
            ],
            [
              -31.0645,
              150.72
            ]
          ]
        },
        {
          "id": "p2",
          "type": "paddock",
          "name": "Back Pdk",
          "note": "",
          "coords": [
            [
              -31.0645,
              150.72
            ],
            [
              -31.0645,
              150.7255
            ],
            [
              -31.069,
              150.7255
            ],
            [
              -31.069,
              150.72
            ]
          ]
        },
        {
          "id": "p3",
          "type": "paddock",
          "name": "Eastern Rye",
          "note": "",
          "coords": [
            [
              -31.06,
              150.7255
            ],
            [
              -31.06,
              150.731
            ],
            [
              -31.0645,
              150.731
            ],
            [
              -31.0645,
              150.7255
            ]
          ]
        },
        {
          "id": "p4",
          "type": "paddock",
          "name": "Shed Rye",
          "note": "",
          "coords": [
            [
              -31.0645,
              150.7255
            ],
            [
              -31.0645,
              150.731
            ],
            [
              -31.069,
              150.731
            ],
            [
              -31.069,
              150.7255
            ]
          ]
        },
        {
          "id": "p5",
          "type": "paddock",
          "name": "Around the Shed",
          "note": "",
          "coords": [
            [
              -31.06,
              150.731
            ],
            [
              -31.06,
              150.7365
            ],
            [
              -31.0645,
              150.7365
            ],
            [
              -31.0645,
              150.731
            ]
          ]
        },
        {
          "id": "f1",
          "type": "fence",
          "name": "Front lane",
          "unit": "u1",
          "note": "",
          "coords": [
            [
              -31.06,
              150.72
            ],
            [
              -31.06,
              150.7365
            ]
          ]
        },
        {
          "id": "f2",
          "type": "fence",
          "name": "Middle fence",
          "unit": "u1",
          "note": "",
          "coords": [
            [
              -31.0645,
              150.72
            ],
            [
              -31.0645,
              150.731
            ]
          ]
        },
        {
          "id": "f3",
          "type": "fence",
          "name": "Back boundary",
          "unit": "u2",
          "note": "Hot wire on offset",
          "coords": [
            [
              -31.069,
              150.72
            ],
            [
              -31.069,
              150.731
            ]
          ]
        },
        {
          "id": "f4",
          "type": "fence",
          "name": "Western boundary",
          "note": "Plain (not electric)",
          "coords": [
            [
              -31.06,
              150.72
            ],
            [
              -31.069,
              150.72
            ]
          ]
        },
        {
          "id": "w1",
          "type": "pipe",
          "name": "Poly from the tank",
          "note": "50 mm",
          "coords": [
            [
              -31.0618,
              150.73375
            ],
            [
              -31.06675,
              150.72825
            ],
            [
              -31.06675,
              150.72275
            ]
          ]
        },
        {
          "id": "pt1",
          "type": "point",
          "kind": "tank",
          "name": "House tank",
          "note": "22,000 L",
          "latlng": [
            -31.0618,
            150.73375
          ]
        },
        {
          "id": "pt2",
          "type": "point",
          "kind": "trough",
          "name": "Shed Rye trough",
          "note": "",
          "latlng": [
            -31.06675,
            150.72825
          ]
        },
        {
          "id": "pt3",
          "type": "point",
          "kind": "trough",
          "name": "Back Pdk trough",
          "note": "",
          "latlng": [
            -31.06675,
            150.72275
          ]
        },
        {
          "id": "pt4",
          "type": "point",
          "kind": "gate",
          "name": "Front gate",
          "note": "",
          "latlng": [
            -31.06,
            150.72275
          ]
        },
        {
          "id": "pt5",
          "type": "point",
          "kind": "yards",
          "name": "Cattle yards",
          "note": "",
          "latlng": [
            -31.0627,
            150.7354
          ]
        },
        {
          "id": "pt6",
          "type": "point",
          "kind": "dam",
          "name": "Back dam",
          "note": "",
          "latlng": [
            -31.06765,
            150.7211
          ]
        }
      ]
    }
  ]
};
