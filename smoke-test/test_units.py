import unittest
import sys
import os

# Add parent directory to path to import subscript
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from subscript import natural_sort_key

class TestSubscriptUnits(unittest.TestCase):
    def test_natural_sort_key(self):
        # Test cases for natural sorting
        files = [
            "page_1.jpg",
            "page_10.jpg",
            "page_2.jpg",
            "page_20.jpg",
            "page_11.jpg"
        ]
        
        expected = [
            "page_1.jpg",
            "page_2.jpg",
            "page_10.jpg",
            "page_11.jpg",
            "page_20.jpg"
        ]
        
        sorted_files = sorted(files, key=natural_sort_key)
        self.assertEqual(sorted_files, expected)

    def test_natural_sort_complex(self):
        # Test with more complex filenames
        files = ["img1.png", "img10.png", "img2.png", "img100.png"]
        expected = ["img1.png", "img2.png", "img10.png", "img100.png"]
        self.assertEqual(sorted(files, key=natural_sort_key), expected)

if __name__ == '__main__':
    unittest.main()
